import cron from "node-cron";
import { connect } from "./dbutil.ts";
import {
    getInProcessingTrackingNums,
    queryEventIds,
    updateEntity,
} from "./dbop.ts";
import { logger } from "./logger.ts";
import { requestWhereIs } from "./gateway.ts";
import { TrackingID } from "./model.ts";

export function startScheduler() {
    // Execute task every 30 seconds
    cron.schedule("*/60 * * * * *", async () => {
        await syncRoutes();
    });
}

async function syncRoutes() {
    let client;
    let inProcessTrackingNums: Record<string, any>;
    try {
        client = await connect();
        inProcessTrackingNums = await getInProcessingTrackingNums(client);

        client.queryObject("BEGIN");
        // for (const inProcessTrackingNum of inProcessTrackingNums) {
        for (const [id, params] of Object.entries(inProcessTrackingNums)) {
            const [error, trackingID] = TrackingID.parse(id);
            if (trackingID === undefined) {
                continue;
            }

            const entity = await requestWhereIs(trackingID, params, "auto-pull");
            if (entity === undefined) continue;

            const eventIds: string[] = await queryEventIds(
                client,
                id,
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
