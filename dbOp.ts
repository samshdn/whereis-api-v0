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
        INSERT INTO entities (
            id, type, origin, destination, derived, ext_a, ext_b, ext_c
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
        );
        `;

    // The data to be inserted
    const values = [
        entity.id,
        entity.type,
        entity.origin,
        entity.destination,
        entity.isDerived(),
        entity.extA, // PostgreSQL will convert JavaScript to JSONB
        entity.extB,
        entity.extC,
    ];

    // 执行插入操作
    const result = await client.queryObject(insertQuery, values);

    if (result.rowCount == 1 && entity.events != undefined) {
        await insertEvents(client, entity.events);
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
        UPDATE entities SET derived=$1,ext_b=$2 WHERE id=$3
        `;
    // update the entity record
    const result = await client.queryObject(updateQuery, [
        entity.isDerived(),
        entity.extB,
        entity.id,
    ]);

    if (result.rowCount == 1) {
        const events: Event[] = entity.events ?? [];
        for (const event of events) {
            if (eventIds.includes(event.eventId)) continue;

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
            notes, ext_a, ext_b
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
        event.extA, // PostgreSQL will convert JavaScript to JSONB
        {},
    ];

    // 执行插入操作
    const result = await client.queryObject(insertQuery, values);

    return result?.rowCount;
}

/**
 * Insert multiple events into table
 * @param client PoolClient
 * @param events event array
 */
async function insertEvents(
    client: PoolClient,
    events: Event[],
): Promise<number | undefined> {
    let result: number = 0;
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (!(await isEventIDExist(client, event.eventId))) {
            result = result + (await insertEvent(client, events[i]) ?? 0);
        }
    }
    return result;
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
                   derived,
                   ext_a,
                   ext_b,
                   ext_c
            FROM entities
            WHERE id = ${trackingNum};
        `;

    let entity;
    if (result.rows.length == 1) {
        const row = result.rows[0];
        entity = {
            id: row[0] as string,
            type: row[1] as string,
            origin: row[2] as string,
            destination: row[3] as string,
            derived: row[4] as boolean,
            extA: row[5] as Record<string, any>,
            extB: row[6] as Record<string, any>,
            extC: row[7] as Record<string, any>,
        } as Entity;
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
                   ext_a,
                   ext_b
            FROM events
            WHERE tracking_num = ${trackingNum};
        `;

    for (const row of result.rows) {
        const event: Event = {
            eventId: row[0] as string,
            trackingNum: row[1] as string,
            status: row[2] as number,
            what: row[3] as string,
            when: row[4] as string,
            where: row[5] as string,
            whom: row[6] as string,
            exceptionCode: row[7] as number,
            exceptionDesc: row[8] as string,
            notificationCode: row[9] as number,
            notificationDesc: row[10] as string,
            notes: row[11] as string,
            extA: row[12] as Record<string, any>,
            extB: row[13] as Record<string, any>,
        };

        events.push(event);
    }

    return events;
}

export async function isEventIDExist(
    client: PoolClient,
    eventId: string,
): Promise<boolean> {
    const result = await client.queryObject`
            SELECT event_id
            FROM events
            WHERE event_id = ${eventId};
        `;

    return result.rows.length == 1;
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
): Promise<string[]> {
    const trackingNums: string[] = [];
    const result = await client.queryArray`
            SELECT id
            FROM entities
            WHERE derived = false;
        `;

    for (const row of result.rows) {
        trackingNums.push(row[0] as string);
    }

    return trackingNums;
}
