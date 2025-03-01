import axios from "axios";
import {logger} from "./logger.ts";

export class Fedex {
    // keep the last token & expire time
    private static token: string;
    // expired in x seconds
    private static expireTime: number = 0;

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

    static async getRoute(trackingNumber: string): Promise<Record<string, any>> {
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
}
