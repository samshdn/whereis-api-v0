import { Pool } from "https://deno.land/x/postgres/mod.ts";
const POOL_CONNECTIONS = 20;

// define db connection params
// export const config = {
//     database: "where_is",
//     hostname: "192.168.159.132",
//     password: "Inteva2025$",
//     port: 5432,
//     user: "postgres",
// };

export const config = {
    database: "where_is",
    hostname: "pg-whereis.internal",
    password: "Inteva2025$",
    port: 5432,
    user: "postgres",
};

// export const dbPool = undefined;
// Init db client pool
export const dbPool = new Pool(
    config,
    POOL_CONNECTIONS,
);