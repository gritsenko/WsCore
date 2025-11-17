import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class RoomInfo {
    id: string | null;
    name: string | null;
    userCount: number;
    supportedModes: (string | null)[] | null;

    constructor() {
        this.id = null;
        this.name = null;
        this.userCount = 0;
        this.supportedModes = null;

    }

    static serialize(value: RoomInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: RoomInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeString(value.id);
        writer.writeString(value.name);
        writer.writeInt32(value.userCount);
        writer.writeArray(value.supportedModes, (writer, x) => writer.writeString(x));

    }

    static serializeArray(value: (RoomInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (RoomInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => RoomInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): RoomInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): RoomInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new RoomInfo();
        if (count == 4) {
            value.id = reader.readString();
            value.name = reader.readString();
            value.userCount = reader.readInt32();
            value.supportedModes = reader.readArray(reader => reader.readString());

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readString(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;
            value.userCount = reader.readInt32(); if (count == 3) return value;
            value.supportedModes = reader.readArray(reader => reader.readString()); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (RoomInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (RoomInfo | null)[] | null {
        return reader.readArray(reader => RoomInfo.deserializeCore(reader));
    }
}
