import { Client, Pool } from 'https://deno.land/x/postgres/mod.ts';

// define db connection params
const config = {
    database: "junk",
    hostname: "localhost",
    password: "Inteva2025$",
    port: 5432,
    user: "postgres"
};

// Init db client
export const db = new Client(config);

const POOL_CONNECTIONS = 20;
export const dbPool = new Pool(
    config,
    POOL_CONNECTIONS,
);