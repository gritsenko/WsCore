import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetChannelRestrictionRequest {
    roomId: string | null;
    userId: number;
    denied: number;
    banned: boolean;
    durationSeconds: number;

    constructor() {
        this.roomId = null;
        this.userId = 0;
        this.denied = 0;
        this.banned = false;
        this.durationSeconds = 0;

    }

    static serialize(value: SetChannelRestrictionRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetChannelRestrictionRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(5);
        writer.writeString(value.roomId);
        writer.writeUint32(value.userId);
        writer.writeUint8(value.denied);
        writer.writeBoolean(value.banned);
        writer.writeUint32(value.durationSeconds);

    }

    static serializeArray(value: (SetChannelRestrictionRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetChannelRestrictionRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetChannelRestrictionRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetChannelRestrictionRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetChannelRestrictionRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetChannelRestrictionRequest();
        if (count == 5) {
            value.roomId = reader.readString();
            value.userId = reader.readUint32();
            value.denied = reader.readUint8();
            value.banned = reader.readBoolean();
            value.durationSeconds = reader.readUint32();

        }
        else if (count > 5) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.userId = reader.readUint32(); if (count == 2) return value;
            value.denied = reader.readUint8(); if (count == 3) return value;
            value.banned = reader.readBoolean(); if (count == 4) return value;
            value.durationSeconds = reader.readUint32(); if (count == 5) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetChannelRestrictionRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetChannelRestrictionRequest | null)[] | null {
        return reader.readArray(reader => SetChannelRestrictionRequest.deserializeCore(reader));
    }
}
