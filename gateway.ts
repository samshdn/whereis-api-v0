import { SfEx } from "./sfEx.ts";
import { FedEx } from "./fedEx.ts";
import { CodeDesc, Entity, ETrackingNum, Event } from "./model.ts";
import { jsonToMd5 } from "./util.ts";

export async function requestWhereIs(
    eagle1TrackingNum: ETrackingNum,
    extraParams: Record<string, string>,
): Promise<Entity | undefined> {
    let entity: Entity | undefined;
    const routes = await requestRoutes(eagle1TrackingNum, extraParams);
    if (routes !== undefined) {
        entity = await convert(eagle1TrackingNum, routes);
    }
    return entity;
}

async function requestRoutes(
    eagle1TrackingNum: ETrackingNum,
    extraParams: Record<string, string>,
) {
    const trackingNum = eagle1TrackingNum.trackingNum;
    switch (eagle1TrackingNum.carrier) {
        case "sfex":
            return await SfEx.getRoute(
                trackingNum,
                extraParams["phone"],
            );
        case "fden":
            return await FedEx.getRoute(eagle1TrackingNum.trackingNum);
    }
    return undefined;
}

async function convert(
    eTrackingNum: ETrackingNum,
    result: Record<string, any>,
) {
    const carrier: string = eTrackingNum.carrier;
    switch (carrier) {
        case "fden":
            return await convertFromFedEx(eTrackingNum.toString(), result);
        case "sfex":
            return await convertFromSfEx(eTrackingNum.toString(), result);
    }
    return undefined;
}

async function convertFromFedEx(
    trakingNum: string,
    json: Record<string, any>,
): Promise<Entity> {
    const entity: Entity = new Entity();
    const statusMapping: Record<string, number> = {
        "IN": 3020,
        "PU": 3050,
        "IT": 3250,
        "DL": 3500,
    };
    const getStatus = (derivedStatusCode: string): number => {
        return statusMapping[derivedStatusCode] ?? 0;
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
    const completeTrackResult = json["output"]["completeTrackResults"][0];
    const trackResult = completeTrackResult["trackResults"][0];
    entity.id = trakingNum;
    entity.type = "waybill";
    entity.origin = getAddress(trackResult["shipperInformation"]["address"]);
    entity.destination = getAddress(
        trackResult["recipientInformation"]["address"],
    );
    entity.extA = {};
    entity.extB = json;
    entity.extC = {};
    const scanEvents = trackResult["scanEvents"];
    for (let i = scanEvents.length - 1; i >= 0; i--) {
        const scanEvent = scanEvents[i];
        const status: number = getStatus(scanEvent["derivedStatusCode"]);
        const event: Record<string, any> = {
            eventId: "ev_" + await jsonToMd5(scanEvent),
            trackingNum: "fden-" + completeTrackResult["trackingNumber"],
            status: status,
            what: CodeDesc.getDesc(status),
            when: scanEvent["date"],
            where: getWhere(scanEvent["scanLocation"]),
            whom: "FedEx",
            extA: {
                locationCoord: "0,0",
                lastUpdateTime: new Date(),
                lastUpdateMethod: "API pull",
            },
        };
        entity.addEvent(event as Event);
    }
    return entity;
}

async function convertFromSfEx(
    trakingNum: string,
    json: Record<string, any>,
): Promise<Entity> {
    const entity: Entity = new Entity();
    const statusMapping: Record<string, number> = {
        "101": 3050,
        "204": 3350,
        "201": 3250,
        "301": 3450,
        "401": 3500,
    };
    const getStatus = (secondaryStatusCode: string): number => {
        return statusMapping[secondaryStatusCode] ?? 0;
    };
    const apiResult = JSON.parse(json["apiResultData"]);
    const routeResp = apiResult["msgData"]["routeResps"][0];
    entity.id = trakingNum;
    entity.type = "waybill";
    entity.origin = "NA";
    entity.destination = "NA";
    entity.extA = {};
    entity.extB = json;
    entity.extC = {};
    const routes = routeResp["routes"];
    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const status = getStatus(route["secondaryStatusCode"]);
        const event: Record<string, any> = {
            eventId: "ev_" + await jsonToMd5(route),
            trackingNum: "sfex-" + routeResp["mailNo"],
            status: status,
            what: CodeDesc.getDesc(status),
            when: route["acceptTime"],
            where: route["acceptAddress"],
            whom: "SFEx",
            notes: route["remark"],
            extA: {
                locationCoord: "0,0",
                lastUpdateTime: Date.now(),
                lastUpdateMethod: "API pull",
            },
        };
        entity.addEvent(event as Event);
    }
    return entity;
}
