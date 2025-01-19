import { Server } from "./server.ts";
import { logger } from "./logger.ts";
import { startScheduler } from "./schedule.ts";
import "https://deno.land/x/dotenv/load.ts";
import { loadJSONFromFs } from "./util.ts";
import { CodeDesc } from "./model.ts";

// load code & desc from file system
const codeDescs: Record<string, any> = await loadJSONFromFs("codes.json");
CodeDesc.initialize(codeDescs);

startScheduler();

const portNo = Deno.env.get("PORT");
const server = new Server(Number(portNo));
server.start();
logger.info(`server started on port ${portNo}`);
