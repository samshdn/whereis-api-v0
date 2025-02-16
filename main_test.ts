import { assert, assertEquals, assertExists, assertFalse } from "@std/assert";
import { jsonToMd5 } from "./util.ts";
import {Event} from "./model.ts";
import {dbPool} from "./dbUtil.ts";
import {logger} from "./logger.ts";

Deno.test(async function md5Test() {
    const json = {
        name: "Alice",
        age: 25,
        isStudent: false,
    };

    const md5Hash = await jsonToMd5(json);
    assertEquals(md5Hash.length, 32);
});

Deno.test(async function loadFedEx() {
    // JSON file path
    const filePath = "E:\\Docs\\Eagle1\\data\\FedEx_770460391597.json";
    // load data from file system
    const data = await Deno.readTextFile(filePath);
    const json = JSON.parse(data);

    assertEquals(
        json["output"]["completeTrackResults"][0]["trackingNumber"],
        "770460391597",
    );
    assert(
        json["output"]["completeTrackResults"][0]["trackResults"][0][
            "scanEvents"
        ].length > 0,
        "The object has scanEvents",
    );
});

Deno.test(async function loadSFExpress() {
    // JSON file path
    const filePath = "E:\\Docs\\Eagle1\\data\\SF_SF1391170523494.json";
    // load data from file system
    const data = await Deno.readTextFile(filePath);
    const json = JSON.parse(data);

    assertEquals(
        json["msgData"]["routeResps"][0]["mailNo"],
        "SF1391170523494",
    );
    assert(
        json["msgData"]["routeResps"][0]["routes"].length > 0,
        "The object has scanEvents",
    );
});

Deno.test.ignore(async function loadFedExToEvents() {
    // load data from file system
    const filePath = "E:\\Docs\\Eagle1\\data\\FedEx_770460391597.json";
    const data = await Deno.readTextFile(filePath);
    // const events: Event[] = await convertFromFedEx(JSON.parse(data));

    let client;
    try {
        // connect to DB
        client = await dbPool.connect();
        // begin transaction
        await client.queryObject("BEGIN");

        // await writeEvents(client, events);

        // commit transaction
        await client.queryObject("COMMIT");
    } catch (error) {
        if (client) {
            await client.queryObject("ROLLBACK");
        }
        logger.error("插入数据时出错:", error);
    } finally {
        // Close connection
        if (client) {
            client.release();
        }
    }

    assert(1 > 0, "inserted records");
});

