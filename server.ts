import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import { dbPool } from "./dbUtil.ts";
import { logger } from "./logger.ts";
import { requestWhereIs } from "./gateway.ts";

import { Entity, ETrackingNum } from "./model.ts";
import { insertEntity, queryEntity } from "./dbOp.ts";

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
            // Carrier-TrackingNumber
            const id = c.req.param("id");
            const eTrackingNum = ETrackingNum.parse(id);
            if (eTrackingNum === undefined) {
                return c.text("Invalid request: url string", 400);
            }

            let entity: Entity | undefined = await this.loadEntityFromDB(id);
            if (entity !== undefined) {
                return c.json(entity);
            }

            const urlString = c.req.url; // get the full url string
            const url = new URL(urlString);
            const queryParams = Object.fromEntries(url.searchParams.entries());

            entity = await requestWhereIs(eTrackingNum, queryParams);
            if (entity === undefined) {
                return c.notFound();
            } else {
                await this.saveEntityToDB(entity);
            }
            return c.json(entity);
        });

        app.get("/dbaction", async (c) => {
            let result;
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

        Deno.serve({ port: this.port }, app.fetch);
    }

    stop(): void {
        console.log(`Server is stopping...`);
    }

    async loadEntityFromDB(eagle1TrackingNum: string) {
        let client;
        let entity: Entity | undefined;
        try {
            client = await dbPool.connect();
            // try to load from database first
            entity = await queryEntity(client, eagle1TrackingNum);
        } catch (error) {
            logger.error(error);
        } finally {
            if (client) {
                client.release();
            }
        }
        return entity;
    }

    async saveEntityToDB(entity: Entity): Promise<number | undefined> {
        let client;
        let result;
        try {
            client = await dbPool.connect();
            client.queryObject("BEGIN");
            result = await insertEntity(client, entity);
            client.queryObject("COMMIT");
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
        return result;
    }
}
