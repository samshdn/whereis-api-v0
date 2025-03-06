import axios from "axios";

import { createHash } from "node:crypto";
import { logger } from "./logger.ts";
import { CodeDesc, Entity, Event } from "./model.ts";
import { jsonToMd5 } from "./util.ts";

export class Sfex {

    static async whereIs(
        trackingNum: string,
        extraParams: Record<string, string>,
        updateMethod: string,
    ): Promise<Entity | undefined> {
        const result = await this.getRoute(
            trackingNum,
            extraParams["phonenum"],
        );
        if (result === undefined) return undefined;

        return await this.convert(
            trackingNum,
            result,
            extraParams,
            updateMethod,
        );
    }

    /**
     * Generate a signed digest for API requests
     * @param {string} msgString - The request payload as a string
     * @param timestamp - the time
     * @param {string} checkWord - The application key
     * @returns {string} - The signed digest
     */
    private static generateSignature(
        msgString: string,
        timestamp: number,
        checkWord: string,
    ): string {
        // need to encode the input data
        return createHash("md5").update(
            encodeURIComponent(msgString + timestamp + checkWord),
        ).digest("base64");
    }

    /**
     * Retrieve shipment details from SF Express
     * @param {string} trackingNumber - The tracking number for the shipment
     * @param phoneNo - The phone NO related to the package
     */
    static async getRoute(
        trackingNumber: string,
        phoneNo: string,
    ): Promise<Record<string, any>> {
        // live
        const SF_EXPRESS_API_URL = Deno.env.get("SF_EXPRESS_API_URL") ?? "";
        const SF_Express_PartnerID = Deno.env.get("SF_EXPRESS_PartnerID") ?? "";
        const SF_Express_CheckWord = Deno.env.get("SF_EXPRESS_CheckWord") ?? "";
        try {
            const msgData = {
                trackingType: 1,
                trackingNumber: trackingNumber,
                checkPhoneNo: phoneNo,
            };
            const timestamp = Date.now();
            const msgString = JSON.stringify(msgData);
            const msgDigest = Sfex.generateSignature(
                msgString,
                timestamp,
                SF_Express_CheckWord,
            );

            // Send the API request
            const response = await axios.post(SF_EXPRESS_API_URL, {
                partnerID: SF_Express_PartnerID,
                requestID: crypto.randomUUID(),
                serviceCode: "EXP_RECE_SEARCH_ROUTES",
                timestamp: timestamp,
                msgDigest: msgDigest,
                msgData: msgString,
            }, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            return response.data;
        } catch (error) {
            logger.error("Error fetching shipment details:", error);
            throw error;
        }
    }

    private static async convert(
        trakingNum: string,
        result: Record<string, any>,
        params: Record<string, string>,
        updateMethod: string,
    ): Promise<Entity | undefined> {
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
                } else if (opCode === 310) {
                    return 3002; // Arrived
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
            } else if (statusCode === 1301) {
                if (opCode === 70) {
                    return 3300; // Arrived At Destination
                }
            }
            return 0;
        };
        const apiResult = JSON.parse(result["apiResultData"]);
        const routeResp = apiResult["msgData"]["routeResps"][0];
        const routes: [] = routeResp["routes"];
        if (routes.length == 0) return undefined;

        const entity: Entity = new Entity();
        entity.uuid = "eg1_" + crypto.randomUUID();
        entity.id = trakingNum;
        entity.type = "waybill";
        entity.params = params;
        entity.extra = {};
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
            event.operatorCode = "sfex";
            event.trackingNum = routeResp["mailNo"];
            event.status = status;
            event.what = CodeDesc.getDesc(status);
            // acceptTime format: 2024-10-26 06:12:43
            const acceptTime: string = route["acceptTime"];
            // convert to isoStringWithTimezone : "2024-10-26T06:12:43+08:00"
            event.when = acceptTime.replace(" ", "T") + "+08:00";
            event.where = route["acceptAddress"];
            event.whom = "SFEx";
            event.notes = route["remark"];
            event.dataProvider = "SF Express";
            event.extra = {
                lastUpdateMethod: updateMethod,
                lastUpdateTime: new Date().toISOString(),
            };
            event.sourceData = route;
            entity.addEvent(event);
        }
        return entity;
    }

}
