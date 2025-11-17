import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class RoomUserInfo {
    clientId: number;
    name: string | null;

    constructor() {
        this.clientId = 0;
        this.name = null;

    }

    static serialize(value: RoomUserInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: RoomUserInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeUint32(value.clientId);
        writer.writeString(value.name);

    }

    static serializeArray(value: (RoomUserInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (RoomUserInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => RoomUserInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): RoomUserInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): RoomUserInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new RoomUserInfo();
        if (count == 2) {
            value.clientId = reader.readUint32();
            value.name = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.clientId = reader.readUint32(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (RoomUserInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (RoomUserInfo | null)[] | null {
        return reader.readArray(reader => RoomUserInfo.deserializeCore(reader));
    }
}
