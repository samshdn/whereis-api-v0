import { load } from "https://deno.land/std/dotenv/mod.ts";
import { logger } from "./logger.ts";
import { loadJSONFromFs } from "./util.ts";
import { initializeDbPool } from "./dbutil.ts";
import { startScheduler } from "./schedule.ts";
import { Server } from "./server.ts";
import { CodeDesc, ErrorRegistry } from "./model.ts";

// load .env file and put the data to  Deno.env
async function loadEnv() {
    const env = await load({ envPath: "./.env" }); // 指定 .env 文件路径
    for (const [key, value] of Object.entries(env)) {
        Deno.env.set(key, value); // 将环境变量手动设置到 Deno.env
    }
}

// load metadata from file system
async function loadMetaData() {
    const status: Record<string, any> = await loadJSONFromFs("codes.json");
    CodeDesc.initialize(status);
    const errors: Record<string, any> = await loadJSONFromFs("errors.json");
    ErrorRegistry.initialize(errors);
}

async function main() {
    await loadEnv(); // load environment variable first
    await loadMetaData(); // load file system data
    initializeDbPool();

    startScheduler();

    const portNo = Deno.env.get("PORT");
    const server = new Server(Number(portNo));
    server.start();
    logger.info(`server started on port ${portNo}`);
}

main().catch((err) => console.error("Failed to start application:", err));
