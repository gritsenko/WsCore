import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetChannelAccessRequest {
    roomId: string | null;
    userId: number;
    hasAccess: boolean;

    constructor() {
        this.roomId = null;
        this.userId = 0;
        this.hasAccess = false;

    }

    static serialize(value: SetChannelAccessRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetChannelAccessRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.roomId);
        writer.writeUint32(value.userId);
        writer.writeBoolean(value.hasAccess);

    }

    static serializeArray(value: (SetChannelAccessRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetChannelAccessRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetChannelAccessRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetChannelAccessRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetChannelAccessRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetChannelAccessRequest();
        if (count == 3) {
            value.roomId = reader.readString();
            value.userId = reader.readUint32();
            value.hasAccess = reader.readBoolean();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.userId = reader.readUint32(); if (count == 2) return value;
            value.hasAccess = reader.readBoolean(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetChannelAccessRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetChannelAccessRequest | null)[] | null {
        return reader.readArray(reader => SetChannelAccessRequest.deserializeCore(reader));
    }
}
