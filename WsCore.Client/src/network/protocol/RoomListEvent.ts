import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { RoomInfo } from "./RoomInfo.js";

export class RoomListEvent {
    eventType: string | null;
    rooms: (RoomInfo | null)[] | null;

    constructor() {
        this.eventType = null;
        this.rooms = null;

    }

    static serialize(value: RoomListEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: RoomListEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.eventType);
        writer.writeArray(value.rooms, (writer, x) => RoomInfo.serializeCore(writer, x));

    }

    static serializeArray(value: (RoomListEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (RoomListEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => RoomListEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): RoomListEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): RoomListEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new RoomListEvent();
        if (count == 2) {
            value.eventType = reader.readString();
            value.rooms = reader.readArray(reader => RoomInfo.deserializeCore(reader));

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.eventType = reader.readString(); if (count == 1) return value;
            value.rooms = reader.readArray(reader => RoomInfo.deserializeCore(reader)); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (RoomListEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (RoomListEvent | null)[] | null {
        return reader.readArray(reader => RoomListEvent.deserializeCore(reader));
    }
}
