import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { RoomInfo } from "./RoomInfo.js";

export class JoinRoomResultEvent {
    roomId: string | null;
    success: boolean;
    error: string | null;
    room: RoomInfo | null;

    constructor() {
        this.roomId = null;
        this.success = false;
        this.error = null;
        this.room = null;

    }

    static serialize(value: JoinRoomResultEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: JoinRoomResultEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeString(value.roomId);
        writer.writeBoolean(value.success);
        writer.writeString(value.error);
        RoomInfo.serializeCore(writer, value.room);

    }

    static serializeArray(value: (JoinRoomResultEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (JoinRoomResultEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => JoinRoomResultEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): JoinRoomResultEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): JoinRoomResultEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new JoinRoomResultEvent();
        if (count == 4) {
            value.roomId = reader.readString();
            value.success = reader.readBoolean();
            value.error = reader.readString();
            value.room = RoomInfo.deserializeCore(reader);

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.success = reader.readBoolean(); if (count == 2) return value;
            value.error = reader.readString(); if (count == 3) return value;
            value.room = RoomInfo.deserializeCore(reader); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (JoinRoomResultEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (JoinRoomResultEvent | null)[] | null {
        return reader.readArray(reader => JoinRoomResultEvent.deserializeCore(reader));
    }
}
