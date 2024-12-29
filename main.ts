
import { Server } from "./server.ts";
import "https://deno.land/x/dotenv/load.ts";

const server = new Server(Number(Deno.env.get("PORT")));
server.start();
