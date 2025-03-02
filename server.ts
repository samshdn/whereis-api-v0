import { Context, Hono, Next } from "hono";
import { StatusCode } from "hono/utils/http-status";
import { QueryArrayResult } from "https://deno.land/x/postgres/mod.ts";

import { logger } from "./logger.ts";
import { connect } from "./dbutil.ts";
import { requestWhereIs } from "./gateway.ts";
import { Entity, ErrorRegistry, TrackingID } from "./model.ts";
import {
    insertEntity,
    queryEntity,
    queryEventIds,
    queryStatus,
    updateEntity,
} from "./dbop.ts";

declare module "hono" {
    // noinspection JSUnusedGlobalSymbols
    interface Context {
        sendError: (errorCode: string) => Response;
    }
}

export class Server {
    private readonly port: number;

    constructor(port: number) {
        this.port = port;
    }

    verifyToken(token: string): boolean {
        return token == "eagle1";
    }

    getHttpCode(errorCode: string): number {
        const parts = errorCode.split("-");
        const httpStatusCode = Number(parts[0]);
        // validate the first part
        if (isNaN(httpStatusCode)) {
            throw new Error("Invalid parameter");
        }

        return httpStatusCode;
    }

    start(): void {
        const app = new Hono();

        // Bearer Auth middleware
        const customBearerAuth = async (c: Context, next: Next) => {
            const authHeader = c.req.header("Authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return c.sendError("401-01");
            }

            const token = authHeader.split(" ")[1];
            const isValidToken = this.verifyToken(token); // 你需要实现这个函数
            if (!isValidToken) {
                return c.sendError("401-02");
            }

            // if token is valid
            await next();
        };

        // Extend Context class
        app.use("*", async (c, next) => {
            // Extend Context，add sendMyJSON method
            c.sendError = (code: string) => {
                return c.json(
                    {
                        code: code,
                        message: ErrorRegistry.getMessage(code),
                    },
                    this.getHttpCode(code) as StatusCode, // unAuthorized
                );
            };
            await next();
        });

        app.use("/v0/*/:id", customBearerAuth);

        app.get("/v0/status/:id?", async (c) => {
            // Carrier-TrackingNumber
            const id = c.req.param("id") ?? "";
            const [error, trackingID] = TrackingID.parse(id);
            if (trackingID == undefined) {
                const errorCode = error ?? "";
                return c.sendError(errorCode);
            }

            const queryParams = this.getExtraParams(
                c.req,
                trackingID.carrier,
            );

            // query DB to get the status
            const status = await this.getStatus(trackingID, queryParams);
            if (status == undefined) {
                return c.sendError("404-01");
            } else {
                return c.json(status);
            }
        });

        app.get("/v0/whereis/:id?", async (c) => {
            // Carrier-TrackingNumber
            const id = c.req.param("id") ?? "";
            const [error, trackingID] = TrackingID.parse(id);
            if (trackingID == undefined) {
                const errorCode = error ?? "";
                return c.sendError(errorCode);
            }

            const queryParams = this.getExtraParams(
                c.req,
                trackingID.carrier,
            );

            // get the full url string
            let entity: Entity | undefined;
            const fullData: boolean = "true" == c.req.query("fulldata");

            if (c.req.param("refresh") === undefined) {
                entity = await this.getObjectFromDbFirst(
                    trackingID,
                    queryParams,
                );
            } else {
                // issue request to carrier
                entity = await this.getObjectFromCarrierFirst(
                    trackingID,
                    queryParams,
                );
            }

            if (entity === undefined) {
                // Not found
                return c.sendError("404-01");
            } else {
                // send response
                return c.json(entity.toJSON(fullData));
            }
        });

        app.get("/dbtest", async (c) => {
            let result: QueryArrayResult | undefined;
            // Init db client
            try {
                using client = await connect();
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

        app.notFound((c) => {
            return c.json(
                {
                    code: "404",
                    message: "未找到对应的资源，请检查请求URL",
                },
                404,
            );
        });

        // 统一错误处理
        app.onError((err, c) => {
            return c.json({
                message: "Internal Server Error",
                error: err.message,
            }, 500);
        });

        Deno.serve({ port: this.port }, app.fetch);
    }

    stop(): void {
        console.log(`Server is stopping...`);
    }

    async getStatus(
        trackingID: TrackingID,
        queryParams: Record<string, string>,
    ) {
        let client;
        let status;
        let entity: Entity | undefined;
        try {
            client = await connect();
            // try to load from database first
            status = await queryStatus(client, trackingID);
            if (status != undefined) {
                return status;
            }

            entity = await requestWhereIs(
                trackingID,
                queryParams,
                "manual-pull",
            );
            if (entity != undefined) {
                client.queryObject("BEGIN");
                await insertEntity(client, entity);
                client.queryObject("COMMIT");
                status = entity.getLastStatus();
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

        return status;
    }

    async getObjectFromDbFirst(
        trackingID: TrackingID,
        queryParams: Record<string, string>,
    ) {
        let client;
        let entity: Entity | undefined;
        try {
            client = await connect();

            // try to load from database first
            entity = await queryEntity(client, trackingID);
            if (entity !== undefined) {
                return entity;
            }

            entity = await requestWhereIs(
                trackingID,
                queryParams,
                "manual-pull",
            );
            if (entity != undefined) {
                client.queryObject("BEGIN");
                await insertEntity(client, entity);
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

        return entity;
    }

    async getObjectFromCarrierFirst(
        trackingID: TrackingID,
        queryParams: Record<string, string>,
    ) {
        // load from carrier
        const entity: Entity | undefined = await requestWhereIs(
            trackingID,
            queryParams,
            "manual-pull",
        );

        if (entity === undefined) {
            return entity;
        }

        // update to database
        let client;
        try {
            client = await connect();
            const eventIds: string[] = await queryEventIds(
                client,
                trackingID.toString(),
            );
            if (entity != undefined && entity.eventNum() > eventIds.length) {
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

        return entity;
    }

    getExtraParams(req: any, carrier: string): Record<string, string> {
        if ("sfex" == carrier) {
            return { phonenum: req.query("phonenum") };
        }
        return {};
    }
}
