import { Sfex } from "./sfex.ts";
import { Fedex } from "./fedex.ts";
import { Entity, TrackingID } from "./model.ts";

export async function requestWhereIs(
    trackingID: TrackingID,
    extraParams: Record<string, string>,
    updateMethod: string,
): Promise<Entity | undefined> {
    const trackingNum = trackingID.trackingNum;
    switch (trackingID.carrier) {
        case "sfex":
            return await Sfex.whereIs(
                trackingNum,
                extraParams,
                updateMethod,
            );
        case "fdx":
            return await Fedex.whereIs(trackingNum, updateMethod);
    }
    return undefined;
}
