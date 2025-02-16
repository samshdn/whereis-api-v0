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

    public static initialize(record: Record<string, string>): void {
        for (const [key, value] of Object.entries(record)) {
            const numericKey = Number(key);
            this.instance.set(numericKey, value);
        }
    }

    public static getDesc(code: number): string {
        return this.instance.get(code) ?? "";
    }
}

export class TrackingID {
    carrier: string;
    trackingNum: string;

    private constructor(carrier: string, trackingNum: string) {
        this.carrier = carrier;
        this.trackingNum = trackingNum;
    }

    toString(): string {
        return this.carrier + "-" + this.trackingNum;
    }

    static parse(strTrackingID: string): TrackingID | undefined {
        const array = strTrackingID.split("-");
        if (array.length === 2) {
            return new TrackingID(array[0], array[1]);
        } else {
            return undefined;
        }
    }
}

export class Entity {
    id?: string;
    type?: string;
    origin?: string;
    destination?: string;
    completed?: boolean;
    dataProvider?: string;
    extra?: Record<string, any>;
    requestData?: Record<string, any>;
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
        const entity = {
            id: this.id,
            type: this.type,
            dataProvider: this.dataProvider,
            ...(this.origin != null && { origin: this.origin }),
            ...(this.destination != null && { destination: this.destination }),
            ...(this.extra != null && Object.keys(this.extra).length > 0 &&
                { extra: this.extra }),
            ...(this.requestData != null &&
                Object.keys(this.requestData).length > 0 &&
                { requestData: this.requestData }),
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

        return { "entity": entity, "events": events };
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
}

export class Event {
    eventId?: string;
    trackingNum?: string;

    status?: number;
    what?: string;
    when?: string;
    where?: string;
    whom?: string;

    exceptionCode?: number;
    exceptionDesc?: string;

    notificationCode?: number;
    notificationDesc?: string;
    notes?: string;

    extra?: Record<string, any>;
    sourceData?: Record<string, any>;

    public toJSON(fullData: boolean = false): Record<string, any> {
        const result: Record<string, any> = {
            eventId: this.eventId,
            trackingNum: this.trackingNum,
            status: this.status,
            what: this.what,
            when: this.when,
            where: this.where,
            whom: this.whom,
            ...(this.exceptionCode != null &&
                { exceptionCode: this.exceptionCode }),
            ...(this.exceptionDesc != null &&
                { exceptionDesc: this.exceptionDesc }),
            ...(this.notificationCode != null &&
                { notificationCode: this.notificationCode }),
            ...(this.notificationDesc != null &&
                { notificationDesc: this.notificationDesc }),
            ...(this.notes != null &&
                { notes: this.notes }),
            extra: this.extra,
        };

        if (fullData) {
            result["sourceData"] = this.sourceData;
        }

        return result;
    }
}
