import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class JoinRoomRequest {
    eventType: string | null;
    roomId: string | null;

    constructor() {
        this.eventType = null;
        this.roomId = null;

    }

    static serialize(value: JoinRoomRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: JoinRoomRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.eventType);
        writer.writeString(value.roomId);

    }

    static serializeArray(value: (JoinRoomRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (JoinRoomRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => JoinRoomRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): JoinRoomRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): JoinRoomRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new JoinRoomRequest();
        if (count == 2) {
            value.eventType = reader.readString();
            value.roomId = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.eventType = reader.readString(); if (count == 1) return value;
            value.roomId = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (JoinRoomRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (JoinRoomRequest | null)[] | null {
        return reader.readArray(reader => JoinRoomRequest.deserializeCore(reader));
    }
}
