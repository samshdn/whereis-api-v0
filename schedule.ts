import cron from "node-cron";
import { dbPool } from "./dbUtil.ts";
import {
    getInProcessingTrackingNums,
    queryEventIds,
    updateEntity,
} from "./dbOp.ts";
import { logger } from "./logger.ts";
import { requestWhereIs } from "./gateway.ts";
import { ETrackingNum } from "./model.ts";

export function startScheduler() {
    // Execute task every 30 seconds
    cron.schedule("*/60 * * * * *", async () => {
        await syncRoutes()
    });
}

async function syncRoutes() {
    let client;
    let inProcessTrackingNums: string[];
    try {
        client = await dbPool.connect();
        inProcessTrackingNums = await getInProcessingTrackingNums(client);

        client.queryObject("BEGIN");
        for (const inProcessTrackingNum of inProcessTrackingNums) {
            const eTrackingNum = ETrackingNum.parse(inProcessTrackingNum);
            if (eTrackingNum === undefined) {
                continue;
            }

            const entity = await requestWhereIs(eTrackingNum, {});
            if (entity === undefined) continue;

            const eventIds: string[] = await queryEventIds(
                client,
                inProcessTrackingNum,
            );
            if (entity.eventNum() > eventIds.length) {
                // update the entity
                await updateEntity(client, entity, eventIds);
            }
        }
        client.queryObject("COMMIT");
    } catch (error) {
        if (client) {
            client.queryObject("ROLLBACK");
        }
        logger.error(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}
