import axios from "axios";
import { logger } from "./logger.ts";
import { CodeDesc, Entity, Event } from "./model.ts";
import { jsonToMd5 } from "./util.ts";

export class Fedex {
    // keep the last token & expire time
    private static token: string;
    // expired in x seconds
    private static expireTime: number = 0;

    static async whereIs(
        trackingNum: string,
        updateMethod: string,
    ): Promise<Entity | undefined> {
        const result = await this.getRoute(trackingNum);
        if (result === undefined) return undefined;

        return await this.convert(trackingNum, result, updateMethod);
    }

    static async getToken(): Promise<string> {
        // Refresh the token 5 seconds before expiration.
        if (Date.now() > this.expireTime - 5000) {
            const fedEx_API_URL: string = Deno.env.get("FedEx_API_URL") ?? "";
            const fedEx_Client_ID: string = Deno.env.get("FedEx_Client_ID") ??
                "";
            const fedEx_Client_Secret: string =
                Deno.env.get("FedEx_Client_Secret") ?? "";
            try {
                const response = await axios.post(fedEx_API_URL, {
                    grant_type: "client_credentials",
                    client_id: fedEx_Client_ID,
                    client_secret: fedEx_Client_Secret,
                }, {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                });

                // console.log("Shipment Details:", response.data);
                this.token = response.data.access_token;
                // expires_in (3600 seconds)
                this.expireTime = Date.now() + response.data.expires_in * 1000;
            } catch (error) {
                // 处理错误情况
                console.error("Could not get JSON:", error);
                throw error;
            }
        }

        if (this.expireTime > 0) {
            return this.token;
        } else {
            return "";
        }
    }

    static async getRoute(
        trackingNumber: string,
    ): Promise<Record<string, any>> {
        try {
            // Prepare the request payload
            const payload = {
                "includeDetailedScans": true,
                "trackingInfo": [
                    {
                        "trackingNumberInfo": {
                            "trackingNumber": trackingNumber,
                        },
                    },
                ],
            };

            // Send the API request
            const token = await this.getToken();
            const FedEx_Track_API_URL: string =
                Deno.env.get("FedEx_Track_API_URL") ?? "";
            const response = await axios.post(FedEx_Track_API_URL, payload, {
                headers: {
                    "Content-Type": "application/json",
                    "X-locale": "en_US",
                    "Authorization": "Bearer " + token,
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
        entity.uuid = "eg1_" + crypto.randomUUID();
        entity.id = trakingNum;
        entity.params = {};
        entity.type = "waybill";
        entity.extra = {
            origin: getAddress(trackResult["shipperInformation"]["address"]),
            destination: getAddress(
                trackResult["recipientInformation"]["address"],
            ),
        };

        const scanEvents = trackResult["scanEvents"];
        for (let i = scanEvents.length - 1; i >= 0; i--) {
            const event = new Event();
            const scanEvent = scanEvents[i];
            const fdxStatusCode = scanEvent["derivedStatusCode"];
            const fdxEventType = scanEvent["eventType"];
            const eagle1status: number = getStatus(fdxStatusCode, fdxEventType);
            event.eventId = "ev_" + await jsonToMd5(scanEvent);
            event.operatorCode = "fdx";
            event.trackingNum = completeTrackResult["trackingNumber"];
            event.status = eagle1status;
            event.what = CodeDesc.getDesc(eagle1status);
            event.when = scanEvent["date"];
            const where = getWhere(scanEvent["scanLocation"]);
            if (where.trim().length > 0) {
                event.where = where;
            } else {
                if (scanEvent["locationType"] == "CUSTOMER") {
                    event.where = "Customer location";
                }
            }
            event.whom = "FedEx";
            event.notes = scanEvent["eventDescription"];
            event.dataProvider = "FedEx";
            event.extra = {
                lastUpdateMethod: updateMethod,
                lastUpdateTime: new Date().toISOString(),
            };
            event.sourceData = scanEvent;
            entity.addEvent(event as Event);
        }
        return entity;
    }
}
