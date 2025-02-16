import { SfEx } from "./sfEx.ts";
import { FedEx } from "./fedEx.ts";
import { CodeDesc, Entity, TrackingID, Event } from "./model.ts";
import { jsonToMd5 } from "./util.ts";
import { logger } from "./logger.ts";

export async function requestWhereIs(
    trackingID: TrackingID,
    extraParams: Record<string, string>,
    updateMethod: string,
): Promise<Entity | undefined> {
    let entity: Entity | undefined;
    const result = await requestRoutes(trackingID, extraParams);
    if (result !== undefined) {
        entity = await convert(
            trackingID,
            result,
            extraParams,
            updateMethod,
        );
    }
    return entity;
}

async function requestRoutes(
    trackingID: TrackingID,
    extraParams: Record<string, string>,
) {
    const trackingNum = trackingID.trackingNum;
    switch (trackingID.carrier) {
        case "sfex":
            return await SfEx.getRoute(
                trackingNum,
                extraParams["phonenum"],
            );
        case "fdx":
            return await FedEx.getRoute(trackingID.trackingNum);
    }
    return undefined;
}

async function convert(
    trackingID: TrackingID,
    result: Record<string, any>,
    params: Record<string, string>,
    updateMethod: string,
) {
    const carrier: string = trackingID.carrier;
    switch (carrier) {
        case "fdx":
            return await convertFromFedEx(
                trackingID.toString(),
                result,
                params,
                updateMethod,
            );
        case "sfex":
            return await convertFromSfEx(
                trackingID.toString(),
                result,
                params,
                updateMethod,
            );
    }
    return undefined;
}

async function convertFromFedEx(
    trakingNum: string,
    result: Record<string, any>,
    params: Record<string, string>,
    updateMethod: string,
): Promise<Entity> {
    const entity: Entity = new Entity();
    const getStatus = (
        derivedStatusCode: string,
        eventType: string,
    ): number => {
        if (derivedStatusCode == "IN") {
            if (eventType == "OC") {
                return 3000; // Transport Bill Created
            }
        } else if (derivedStatusCode == "IT") {
            if (eventType == "DR") {
                return 3250; // In-Transit
            } else if (eventType == "DP") {
                return 3004;
            } else if (eventType == "AR") {
                return 3002; // Arrived
            } else if (eventType == "IT") {
                return 3001; // Logistics In-Progress
            } else if (eventType == "AF") {
                return 3001; // Logistics In-Progress
            } else if (eventType == "CC") {
                return 3400; // Customs Clearance: Import Released
            } else if (eventType == "OD") {
                return 3450; // Final Delivery In-Progess
            }
        } else if (derivedStatusCode == "PU") {
            return 3050; // Picked Up
        } else if (derivedStatusCode == "DL") {
            return 3500; // Delivered
        }
        logger.error(
            `NO status defined for ${derivedStatusCode} & ${eventType}`,
        );
        return 0;
    };
    const getWhere = (scanLocation: Record<string, unknown>): string => {
        return (scanLocation["city"] ?? "") + " " +
            (scanLocation["stateOrProvinceCode"] ?? "") + " " +
            (scanLocation["countryName"] ?? "");
    };
    const getAddress = (address: Record<string, unknown>): string => {
        return (address["city"] ?? "") + " " +
            (address["stateOrProvinceCode"] ?? "") + " " +
            address["countryName"];
    };
    const completeTrackResult = result["output"]["completeTrackResults"][0];
    const trackResult = completeTrackResult["trackResults"][0];
    entity.id = trakingNum;
    entity.params = params;
    entity.type = "waybill";
    entity.dataProvider = "FedEx";
    entity.origin = getAddress(trackResult["shipperInformation"]["address"]);
    entity.destination = getAddress(
        trackResult["recipientInformation"]["address"],
    );
    entity.extra = {};
    entity.requestData = {
        transactionId: result["transactionId"],
    };
    const scanEvents = trackResult["scanEvents"];
    for (let i = scanEvents.length - 1; i >= 0; i--) {
        const event = new Event();
        const scanEvent = scanEvents[i];
        const fdxStatusCode = scanEvent["derivedStatusCode"];
        const fdxEventType = scanEvent["eventType"];
        const eagle1status: number = getStatus(fdxStatusCode, fdxEventType);

        event.eventId = "ev_" + await jsonToMd5(scanEvent);
        event.trackingNum = "fdx-" + completeTrackResult["trackingNumber"];
        event.status = eagle1status;
        event.what = CodeDesc.getDesc(eagle1status);
        event.when = scanEvent["date"];
        const where = getWhere(scanEvent["scanLocation"]);
        if(where.trim().length > 0){
            event.where = where;
        } else {
            if(scanEvent["locationType"] == "CUSTOMER") {
                event.where = "Customer location";
            }
        }
        event.whom = "FedEx";
        event.notes = scanEvent["eventDescription"];
        event.extra = {
            lastUpdateTime: new Date().toISOString(),
            lastUpdateMethod: updateMethod,
        };
        event.sourceData = scanEvent;
        entity.addEvent(event as Event);
    }
    return entity;
}

async function convertFromSfEx(
    trakingNum: string,
    result: Record<string, any>,
    params: Record<string, string>,
    updateMethod: string,
): Promise<Entity> {
    const entity: Entity = new Entity();
    const getStatus = (statusCode: number, opCode: number): number => {
        if (statusCode === 101) {
            return 3100;
        } else if (statusCode === 201) {
            // todo...review opCode 30
            if (opCode === 30) {
                return 3001;
            } else if (opCode === 31) {
                return 3002; // arrived
            } else if (opCode === 36) {
                return 3004; // Departed
            } else if (opCode === 105) {
                return 3250; // In-Transit
            } else if (opCode === 106) {
                return 3300; // Arrived At Destination
            }
        } else if (statusCode === 204) {
            if (opCode === 605) {
                return 3350; // Customs Clearance: Import In-Progress
            }
        } else if (statusCode === 301) {
            if (opCode === 44) {
                return 3001; // Logistics In-Progress
            } else if (opCode === 204) {
                return 3450; // Final Delivery In-Progress
            }
        } else if (statusCode === 401) {
            if (opCode === 80) {
                return 3500; // Delivered
            }
        }
        return 0;
    };
    const apiResult = JSON.parse(result["apiResultData"]);
    const routeResp = apiResult["msgData"]["routeResps"][0];
    entity.id = trakingNum;
    entity.type = "waybill";
    entity.dataProvider = "SF Express";
    entity.params = params;
    entity.extra = {};
    entity.requestData = {
        apiErrorMsg: result["apiErrorMsg"],
        apiResultCode: result["apiResultCode"],
        apiResponseID: result["apiResponseID"],
    };
    const routes: [] = routeResp["routes"];
    routes.sort((a, b) =>
        new Date(a["acceptTime"]).getTime() -
        new Date(b["acceptTime"]).getTime()
    );
    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];

        const sfStatusCode = parseInt(route["secondaryStatusCode"]);
        const sfOpCode = parseInt(route["opCode"]);
        const status = getStatus(sfStatusCode, sfOpCode);
        const event: Event = new Event();
        event.eventId = "ev_" + await jsonToMd5(route);
        event.trackingNum = "sfex-" + routeResp["mailNo"];
        event.status = status;
        event.what = CodeDesc.getDesc(status);
        // acceptTime format: 2024-10-26 06:12:43
        const acceptTime: string = route["acceptTime"];
        // convert to isoStringWithTimezone : "2024-10-26T06:12:43+08:00"
        event.when = acceptTime.replace(" ", "T") + "+08:00";
        event.where = route["acceptAddress"];
        event.whom = "SFEx";
        event.notes = route["remark"];
        event.extra = {
            lastUpdateTime: new Date().toISOString(),
            lastUpdateMethod: updateMethod,
        };
        event.sourceData = route;
        entity.addEvent(event);
    }
    return entity;
}
