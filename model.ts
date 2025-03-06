export class CodeDesc {
    private static instance: CodeDesc = new CodeDesc();

    // keep key-value pairs
    private data: { [key: number]: string } = {};

    // add key-value pair
    set(key: number, value: string): void {
        this.data[key] = value;
    }

    // get value by key
    get(key: number): string | undefined {
        return this.data[key];
    }

    // clear all key-value pairs
    clear(): void {
        this.data = {};
    }

    public static initialize(record: Record<string, any>): void {
        for (const [key, value] of Object.entries(record)) {
            const numericKey = Number(key);
            this.instance.set(numericKey, value);
        }
    }

    public static getDesc(code: number): string {
        return this.instance.get(code) ?? "";
    }
}

// Define error codes
export class ErrorRegistry {
    private static instance: ErrorRegistry = new ErrorRegistry();

    // keep code-description pairs
    private data: { [code: string]: string } = {};

    // add key-value pair
    set(code: string, description: string): void {
        this.data[code] = description;
    }

    // get value by key
    get(code: string): string | undefined {
        return this.data[code];
    }

    // load error code & message from metadata
    static initialize(record: Record<string, any>): void {
        for (const [key, value] of Object.entries(record)) {
            this.instance.set(key, value);
        }
    }

    // get error message by error code
    static getMessage(code: string): string | undefined {
        return this.instance.get(code) ?? "";
    }
}

type ParseResult = [
    string | undefined,
    TrackingID | undefined,
];

export class TrackingID {
    carrier: string;
    trackingNum: string;

    static carriers: string[] = ["fdx", "sfex"];

    private constructor(carrier: string, trackingNum: string) {
        this.carrier = carrier;
        this.trackingNum = trackingNum;
    }

    toString(): string {
        return this.carrier + "-" + this.trackingNum;
    }

    static parse(strTrackingID: string): ParseResult {
        const array = strTrackingID.split("-");
        if ("" == strTrackingID.trim()) {
            return ["400-01", undefined];
        } else if (array.length != 2) {
            return ["400-05", undefined];
        } else {
            const carrier: string = array[0];
            const trackingNum: string = array[1];
            if (!this.carriers.includes(carrier)) {
                return ["400-04", undefined];
            }
            if ("fdx" == carrier) {
                const errorCode = this.checkFedExTrackingNum(trackingNum);
                if (errorCode != undefined) {
                    return [errorCode, undefined];
                }
            }
            if ("sfex" == carrier) {
                const errorCode = this.checkSFTrackingNum(trackingNum);
                if (errorCode != undefined) {
                    return [errorCode, undefined];
                }
            }
            return [undefined, new TrackingID(carrier, trackingNum)];
        }
    }

    static checkFedExTrackingNum(trackingNum: string): string | undefined {
        if (trackingNum.length != 12) {
            return "400-02";
        }
        return undefined;
    }

    static checkSFTrackingNum(trackingNum: string): string | undefined {
        if (trackingNum.length != 15 || !trackingNum.startsWith("SF")) {
            return "400-02";
        }
        return undefined;
    }
}

export class Entity {
    uuid?: string;
    id?: string;
    type?: string;
    completed?: boolean;
    creationTime?: string;
    extra?: Record<string, any>;
    params?: Record<string, any>;
    events?: Event[] = [];

    constructor(
        id?: string,
        type?: string,
    ) {
        this.id = id;
        this.type = type;
    }

    public toJSON(fullData: boolean = false): Record<string, any> {
        const extra = this.extra;
        const additional = {
            ...(extra != null && ("origin" in extra) &&
                { origin: extra["origin"] }),
            ...(extra != null && ("destination" in extra) &&
                { destination: extra["destination"] }),
        };
        const object = {
            uuid: this.uuid,
            id: this.id,
            type: this.type,
            creationTime: this.getCreationTime(),
            additional: Object.keys(additional).length > 0
                ? additional
                : undefined,
        };

        const events = [];
        if (
            this.events !== undefined &&
            Object.keys(this.events).length > 0
        ) {
            for (const event of this.events) {
                events.push(event.toJSON(fullData));
            }
        }

        return { "object": object, "events": events };
    }

    public eventNum() {
        return this.events === undefined ? 0 : this.events.length;
    }

    public addEvent(event: Event) {
        if (this.events == undefined) {
            this.events = [];
        }
        this.events.push(event);
    }

    public lastEvent(): Event | undefined {
        if (this.events === undefined) return undefined;

        return this.events[this.events.length - 1];
    }

    public lastMajorEvent(): Event | undefined {
        if (this.events === undefined) return undefined;

        for (let i = this.events.length - 1; i >= 0; i--) {
            const event = this.events[i];
            if (event.status !== undefined && event.status % 100 === 0) {
                return event;
            }
        }
    }

    public lastMinorEvent(): Event | undefined {
        if (this.events === undefined) return undefined;

        for (let i = this.events.length - 1; i >= 0; i--) {
            const event = this.events[i];
            if (event.status !== undefined && event.status % 100 === 50) {
                return event;
            }
        }
    }

    public isCompleted() {
        if (this.events === undefined) return false;

        for (let i = this.events.length - 1; i >= 0; i--) {
            if (this.events[i].status === 3500) {
                return true;
            }
        }
    }

    public getCreationTime() {
        if (this.events === undefined) return "";

        return this.events[0].when;
    }

    public getLastStatus() {
        const lastEvent = this.lastEvent();
        if (lastEvent === undefined) {
            return undefined;
        } else {
            return {
                id: this.id,
                status: lastEvent.status,
                what: lastEvent.what,
            };
        }
    }
}

export class Event {
    eventId?: string;
    operatorCode?: string;
    trackingNum?: string;

    status?: number;
    what?: string;
    when?: string;
    where?: string;
    whom?: string;

    notes?: string;
    dataProvider?: string;

    lastUpdateMethod?: string;
    lastUpdateTime?: string;
    transitMode?: string;

    exceptionCode?: number;
    exceptionDesc?: string;

    notificationCode?: number;
    notificationDesc?: string;

    extra?: Record<string, any>;
    sourceData?: Record<string, any>;

    public toJSON(fullData: boolean = false): Record<string, any> {
        const extra = this.extra;
        const result: Record<string, any> = {
            status: this.status,
            what: this.what,
            when: this.when,
            where: this.where,
            whom: this.whom,
            additional: {
                operatorCode: this.operatorCode,
                trackingNum: this.trackingNum,
                ...(this.notes != null && { notes: this.notes }),
                ...(this.dataProvider != null &&
                    { dataProvider: this.dataProvider }),
                ...(extra != null && ("lastUpdateMethod" in extra) &&
                    { lastUpdateMethod: extra["lastUpdateMethod"] }),
                ...(extra != null && ("lastUpdateTime" in extra) &&
                    { lastUpdateTime: extra["lastUpdateTime"] }),
                ...(this.exceptionCode != null &&
                    { exceptionCode: this.exceptionCode }),
                ...(this.exceptionDesc != null &&
                    { exceptionDesc: this.exceptionDesc }),
                ...(this.notificationCode != null &&
                    { notificationCode: this.notificationCode }),
                ...(this.notificationDesc != null &&
                    { notificationDesc: this.notificationDesc }),
                ...(extra != null && ("transitMode" in extra) &&
                    { transitMode: extra["transitMode"] }),
            },
        };

        if (fullData) {
            result["sourceData"] = this.sourceData;
        }

        return result;
    }
}
