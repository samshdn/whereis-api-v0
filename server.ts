import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { QueryArrayResult } from "https://deno.land/x/postgres/mod.ts";

import { dbPool } from "./dbUtil.ts";
import { logger } from "./logger.ts";
import { requestWhereIs } from "./gateway.ts";
import { Entity, TrackingID } from "./model.ts";
import {
    insertEntity,
    queryEntity,
    queryEventIds,
    updateEntity,
} from "./dbOp.ts";

export class Server {
    private readonly port: number;

    constructor(port: number) {
        this.port = port;
    }

    start(): void {
        const app = new Hono();

        app.use(
            "/v0/*/:id",
            bearerAuth({
                verifyToken: async (token: string, c) => {
                    return token === "eagle1";
                },
            }),
        );

        app.get("/v0/status/:id", async (c) => {
            const id = c.req.param("id");
            // query DB to get the status
            return c.json({ status: 3500, what: "Delivered" });
        });

        app.get("/v0/whereis/:id", async (c) => {
            try {
                // Carrier-TrackingNumber
                const id = c.req.param("id");
                const trackingID = TrackingID.parse(id);
                if (trackingID == undefined) {
                    return c.text("Invalid request: url string", 400);
                }

                // get the full url string
                let entity: Entity | undefined;
                const fullData: boolean = "true" == c.req.query("fulldata");
                const queryParams = this.getExtraParams(
                    c.req,
                    trackingID.carrier,
                );
                if (c.req.param("refresh") === undefined) {
                    let client;
                    try {
                        client = await dbPool.connect();

                        // try to load from database first
                        entity = await queryEntity(client, trackingID);
                        if (entity !== undefined) {
                            return c.json(entity.toJSON(fullData));
                        }

                        entity = await requestWhereIs(
                            trackingID,
                            queryParams,
                            "manual-pull",
                        );
                        if (entity === undefined) {
                            return c.notFound();
                        }

                        client.queryObject("BEGIN");
                        await insertEntity(client, entity);
                        client.queryObject("COMMIT");
                        return c.json(entity.toJSON(fullData));
                    } catch (error) {
                        logger.error(error);
                        if (client) {
                            client.queryObject("ROLLBACK");
                        }
                    } finally {
                        if (client) {
                            client.release();
                        }
                    }
                } else {
                    // load from carrier
                    const entity = await requestWhereIs(
                        trackingID,
                        queryParams,
                        "manual-pull",
                    );
                    // case A: the entity can not be found
                    if (entity === undefined) {
                        return c.notFound();
                    }

                    // case B: entity is NOT null, update the routes on-necessary
                    let client;
                    try {
                        client = await dbPool.connect();
                        const eventIds: string[] = await queryEventIds(
                            client,
                            id,
                        );
                        if (entity.eventNum() > eventIds.length) {
                            // update the entity
                            client.queryObject("BEGIN");
                            await updateEntity(client, entity, eventIds);
                            client.queryObject("COMMIT");
                        }
                    } catch (error) {
                        logger.error(error);
                        if (client) {
                            client.queryObject("ROLLBACK");
                        }
                    } finally {
                        if (client) {
                            client.release();
                        }
                    }
                    // send response
                    return c.json(entity.toJSON(fullData));
                }
            } catch (err) {
                console.error("Error in /detailed route:", err);
                return c.json({
                    message: "Error caught locally",
                    error: (err as Error).message,
                }, 400);
            }
        });

        app.get("/dbaction", async (c) => {
            let result: QueryArrayResult | undefined;
            // Init db client
            try {
                using client = await dbPool.connect();
                result = await client.queryArray`SELECT now()`;
            } catch (error) {
                logger.error(`Database operation failed: ${error}`);
            }
            if (result === undefined) {
                c.notFound();
            } else {
                return c.text(String(result.rows[0][0]));
            }
        });

        app.get("/", (c) => {
            return c.html("<h3>Hello Eegle1!</h3>");
        });

        // // 统一错误处理
        // app.onError((err, c) => {
        //     console.error("Caught error:", err);
        //     return c.json({
        //         message: "Internal Server Error",
        //         error: err.message,
        //     }, 500);
        // });

        Deno.serve({ port: this.port }, app.fetch);
    }

    stop(): void {
        console.log(`Server is stopping...`);
    }

    getExtraParams(req: any, carrier: string): Record<string, string> {
        if ("sfex" == carrier) {
            return { phonenum: req.query("phonenum") };
        }
        return {};
    }
}
