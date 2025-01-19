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

export class ETrackingNum {
    carrier: string;
    trackingNum: string;

    private constructor(carrier: string, trackingNum: string) {
        this.carrier = carrier;
        this.trackingNum = trackingNum;
    }

    toString(): string {
        return this.carrier + "-" + this.trackingNum;
    }

    static parse(eagle1TrackingNum: string): ETrackingNum | undefined {
        const array = eagle1TrackingNum.split("-");
        if (array.length === 2) {
            return new ETrackingNum(array[0], array[1]);
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
    derived?: boolean;
    events?: Event[] = [];
    extA?: Record<string, any>;
    extB?: Record<string, any>;
    extC?: Record<string, any>;

    constructor(
        id?: string,
        type?: string,
        origin?: string,
        destination?: string,
        extA?: Record<string, any>,
        extB?: Record<string, any>,
    ) {
        this.id = id;
        this.type = type;
        this.origin = origin;
        this.destination = destination;
        this.extA = extA;
        this.extB = extB;
    }

    public isDerived() {
        if (this.events === undefined) return false;
        for (let i = 0; i < this.events.length; i++) {
            if (this.events[i].status === 3500) {
                return true;
            }
        }
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

    public getNewEvents(fromNum: number): Event[] | undefined {

        return this.events === undefined
            ? undefined
            : this.events.slice(fromNum);
    }
}

export class Event {
    eventId: string;
    trackingNum: string;

    status: number;
    what: string;
    when: string;
    where: string;
    whom: string;

    exceptionCode?: number;
    exceptionDesc?: string;

    notificationCode?: number;
    notificationDesc?: string;
    notes?: string;

    extA: Record<string, any>;
    extB: Record<string, any>;

    constructor(
        eventId: string,
        trackingNum: string,
        status: number,
        what: string,
        when: string,
        where: string,
        whom: string,
        extA: Record<string, any>,
        extB: Record<string, any>,
    ) {
        this.eventId = eventId;
        this.trackingNum = trackingNum;
        this.status = status;
        this.what = what;
        this.when = when;
        this.where = where;
        this.whom = whom;
        this.extA = extA;
        this.extB = extB;
    }
}
