import { Context, Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { SfEx } from "./sfEx.ts";
import { FedEx } from "./fedEx.ts";
import {
    BlankEnv,
    BlankInput,
} from "https://jsr.io/@hono/hono/4.6.12/src/types.ts";

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
                    console.log(token);
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
            const id = c.req.param("id");
            const arr = id.split("-");
            if (arr.length !== 2) {
                return c.notFound();
            }

            return this.whereIs(c, arr[0], arr[1]);
        });

        app.get("/", (c) => {
            return c.text("Hello Hono!");
        });

        Deno.serve({ port: this.port }, app.fetch);
    }

    stop(): void {
        console.log(`Server is stopping...`);
    }

    async whereIs(
        c,
        id1: string,
        id2: string,
    ): Promise<void> {
        let result;
        if ("sfex" === id1) {
            const array = id2.split("_");
            result = await SfEx.getRoute(array[0], array[1]);
        } else if ("fden" === id1) {
            result = await FedEx.getRoute(id2);
            console.log(result);
        }
        if (result !== undefined) {
            return c.json(result);
        } else {
            return c.notFound();
        }
    }
}
