import { Pool } from "https://deno.land/x/postgres/mod.ts";
const POOL_CONNECTIONS = 20;

let dbPool: Pool | null = null;

export function initializeDbPool() {
    if (!dbPool) {
        dbPool = new Pool(
            {
                database: Deno.env.get("DATABASE_NAME"),
                hostname: Deno.env.get("DATABASE_HOST"),
                password: Deno.env.get("DATABASE_PASSWORD"),
                port: Deno.env.get("DATABASE_PORT"),
                user: Deno.env.get("DATABASE_USER"),
            },
            POOL_CONNECTIONS,
        )
    }
    return dbPool;
}

export async function connect() {
    if (!dbPool) {
        throw new Error("Database pool not initialized. Call initializeDbPool first.");
    }
    return await dbPool.connect();
}