import { PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { Entity, Event, TrackingID } from "./model.ts";

/**
 * Insert entity and events into table
 * @param client PoolClient
 * @param entity Entity object with events
 */
export async function insertEntity(
    client: PoolClient,
    entity: Entity,
): Promise<number | undefined> {
    // SQL statement for inserting
    const insertQuery = `
        INSERT INTO entities (uuid, id, type, creation_time, completed, extra, params)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

    // The data to be inserted
    const values = [
        entity.uuid,
        entity.id,
        entity.type,
        entity.getCreationTime(),
        entity.isCompleted(),
        entity.extra,
        entity.params,
    ];

    // 执行插入操作
    const result = await client.queryObject(insertQuery, values);

    if (result.rowCount == 1 && entity.events != undefined) {
        for (const event of entity.events) {
            await insertEvent(client, event);
        }
    }

    return result?.rowCount;
}

export async function updateEntity(
    client: PoolClient,
    entity: Entity,
    eventIds: string[],
): Promise<number | undefined> {
    // SQL statement for updating
    const updateQuery = `
        UPDATE entities SET completed=$1 WHERE id=$2
        `;
    // update the entity record
    const result = await client.queryObject(updateQuery, [
        entity.isCompleted(),
        entity.id,
    ]);

    if (result.rowCount == 1) {
        const events: Event[] = entity.events ?? [];
        for (const event of events) {
            if (
                event.eventId !== undefined && eventIds.includes(event.eventId)
            ) continue;
            console.log(event.eventId);
            await insertEvent(client, event);
        }
    }
    return result?.rowCount;
}

/**
 * Insert one event data into table
 * @param client PoolClient
 * @param event Event object
 */
async function insertEvent(
    client: PoolClient,
    event: Event,
): Promise<number | undefined> {
    // SQL statement for inserting
    const insertQuery = `
        INSERT INTO events (
            event_id, tracking_num, status, what, when_, where_, whom,
            exception_code, exception_desc, notification_code, notification_desc,
            notes, extra, source_data, data_provider,operator_code
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        );
        `;

    // The data to be inserted
    const values = [
        event.eventId,
        event.trackingNum,
        event.status,
        event.what,
        event.when,
        event.where,
        event.whom,
        event.exceptionCode,
        event.exceptionDesc,
        event.notificationCode,
        event.notificationDesc,
        event.notes,
        event.extra,
        event.sourceData,
        event.dataProvider,
        event.operatorCode,
    ];

    // 执行插入操作
    const result = await client.queryObject(insertQuery, values);

    return result?.rowCount;
}

// 按 tracking_num 查询数据
export async function queryEntity(
    client: PoolClient,
    trackingID: TrackingID,
): Promise<Entity | undefined> {
    const result = await client.queryArray`
        SELECT uuid,
               id,
               type,
               completed,
               extra,
               params,
               creation_time
        FROM entities
        WHERE id = ${trackingID.toString()};
    `;

    let entity: Entity | undefined;
    if (result.rows.length == 1) {
        entity = new Entity();
        const row = result.rows[0];
        entity.uuid = row[0] as string;
        entity.id = row[1] as string;
        entity.type = row[2] as string;
        entity.completed = row[3] as boolean;
        entity.extra = row[4] as Record<string, any>;
        entity.params = row[5] as Record<string, any>;
        entity.creationTime = row[6] as string;
    }

    if (entity != undefined) {
        entity.events = await queryEvents(client, trackingID);
    }
    return entity;
}

// 按 tracking_num 查询数据
async function queryEvents(
    client: PoolClient,
    trackingID: TrackingID,
): Promise<Event[]> {
    const events: Event[] = [];
    const result = await client.queryArray`
        SELECT event_id,
               operator_code,
               tracking_num,
               status,
               what,
               when_,
               where_,
               whom,
               exception_code,
               exception_desc,
               notification_code,
               notification_desc,
               notes,
               extra,
               source_data,
               data_provider
        FROM events
        WHERE operator_code = ${trackingID.carrier}
          AND tracking_num = ${trackingID.trackingNum};
    `;

    for (const row of result.rows) {
        const event = new Event();
        event.eventId = row[0] as string;
        event.operatorCode = row[1] as string;
        event.trackingNum = row[2] as string;
        event.status = row[3] as number;
        event.what = row[4] as string;
        event.when = row[5] as string;
        event.where = row[6] as string;
        event.whom = row[7] as string;
        event.exceptionCode = row[8] as number;
        event.exceptionDesc = row[9] as string;
        event.notificationCode = row[10] as number;
        event.notificationDesc = row[11] as string;
        event.notes = row[12] as string;
        event.extra = row[13] as Record<string, any>;
        event.sourceData = row[14] as Record<string, any>;
        event.dataProvider = row[15] as string;
        events.push(event);
    }

    return events;
}

export async function queryEventIds(
    client: PoolClient,
    eTrackingNum: string,
): Promise<string[]> {
    const eventIds: string[] = [];
    const result = await client.queryArray`
        SELECT event_id
        FROM events
        WHERE tracking_num = ${eTrackingNum};
    `;

    for (const row of result.rows) {
        eventIds.push(row[0] as string);
    }
    return eventIds;
}

export async function getInProcessingTrackingNums(
    client: PoolClient,
): Promise<Record<string, any>> {
    // const trackingNums: string[] = [];
    const trackingNums: Record<string, any> = {};
    const result = await client.queryArray`
            SELECT id, params
            FROM entities
            WHERE completed = false;
        `;

    for (const row of result.rows) {
        trackingNums[row[0] as string] = row[1];
        // trackingNums.push(row[0] as string);
    }

    return trackingNums;
}
