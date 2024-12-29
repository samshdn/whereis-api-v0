// import axios from "axios";
import axios from "https://cdn.skypack.dev/axios";

import { createHash } from "node:crypto";

export class SfEx {
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
    ): Promise<JSON> {
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
            const msgDigest = SfEx.generateSignature(
                msgString,
                Date.now(),
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
            // console.log("Shipment Details:", response.data);
        } catch (error) {
            console.error("Error fetching shipment details:", error);
            throw error;
        }
    }
}

// import "https://deno.land/x/dotenv/load.ts";
//
// const checkkWord = Deno.env.get("SF_EXPRESS_CheckkWord") ?? "";
// // Example usage： SF3125541537519(5567) / SF1391170523494(0473)
// const data = await SFExpress.getShipmentDetails("SF3125541537519", "5567"); // Replace with a valid tracking number
// console.log(data);
