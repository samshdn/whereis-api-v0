import { PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { Entity, Event } from "./model.ts";

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
        INSERT INTO entities (id, type, origin, destination, completed, extra, request_data, params, data_provider)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

    // The data to be inserted
    const values = [
        entity.id,
        entity.type,
        entity.origin,
        entity.destination,
        entity.isCompleted(),
        entity.extra,
        entity.requestData,
        entity.params,
        entity.dataProvider,
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
        UPDATE entities SET completed=$1,request_data=$2 WHERE id=$3
        `;
    // update the entity record
    const result = await client.queryObject(updateQuery, [
        entity.isCompleted(),
        entity.requestData,
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
            notes, extra, source_data
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
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
    ];

    // 执行插入操作
    const result = await client.queryObject(insertQuery, values);

    return result?.rowCount;
}

// 按 tracking_num 查询数据
export async function queryEntity(
    client: PoolClient,
    trackingNum: string,
): Promise<Entity | undefined> {
    const result = await client.queryArray`
            SELECT id,
                   type,
                   origin,
                   destination,
                   completed,
                   extra,
                   request_data,
                   params,
                   data_provider
            FROM entities
            WHERE id = ${trackingNum};
        `;

    let entity: Entity | undefined;
    if (result.rows.length == 1) {
        entity = new Entity();
        const row = result.rows[0];
        entity.id = row[0] as string;
        entity.type = row[1] as string;
        entity.origin = row[2] as string;
        entity.destination = row[3] as string;
        entity.completed = row[4] as boolean;
        entity.extra = row[5] as Record<string, any>;
        entity.requestData = row[6] as Record<string, any>;
        entity.params = row[7] as Record<string, any>;
        entity.dataProvider = row[8] as string;
    }

    if (entity != undefined) {
        entity.events = await queryEvents(client, trackingNum);
    }
    return entity;
}

// 按 tracking_num 查询数据
async function queryEvents(
    client: PoolClient,
    trackingNum: string,
): Promise<Event[]> {
    const events: Event[] = [];
    const result = await client.queryArray`
            SELECT event_id,
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
                   source_data
            FROM events
            WHERE tracking_num = ${trackingNum};
        `;

    for (const row of result.rows) {
        const event = new Event();
        event.eventId = row[0] as string;
        event.trackingNum = row[1] as string;
        event.status = row[2] as number;
        event.what = row[3] as string;
        event.when = row[4] as string;
        event.where = row[5] as string;
        event.whom = row[6] as string;
        event.exceptionCode = row[7] as number;
        event.exceptionDesc = row[8] as string;
        event.notificationCode = row[9] as number;
        event.notificationDesc = row[10] as string;
        event.notes = row[11] as string;
        event.extra = row[12] as Record<string, any>;
        event.sourceData = row[13] as Record<string, any>;
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