import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChannelRestrictionInfo {
    userId: number;
    denied: number;
    banned: boolean;
    untilMs: number;

    constructor() {
        this.userId = 0;
        this.denied = 0;
        this.banned = false;
        this.untilMs = 0;

    }

    static serialize(value: ChannelRestrictionInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChannelRestrictionInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint32(value.userId);
        writer.writeUint8(value.denied);
        writer.writeBoolean(value.banned);
        writer.writeFloat64(value.untilMs);

    }

    static serializeArray(value: (ChannelRestrictionInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChannelRestrictionInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChannelRestrictionInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChannelRestrictionInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChannelRestrictionInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChannelRestrictionInfo();
        if (count == 4) {
            value.userId = reader.readUint32();
            value.denied = reader.readUint8();
            value.banned = reader.readBoolean();
            value.untilMs = reader.readFloat64();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.userId = reader.readUint32(); if (count == 1) return value;
            value.denied = reader.readUint8(); if (count == 2) return value;
            value.banned = reader.readBoolean(); if (count == 3) return value;
            value.untilMs = reader.readFloat64(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChannelRestrictionInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChannelRestrictionInfo | null)[] | null {
        return reader.readArray(reader => ChannelRestrictionInfo.deserializeCore(reader));
    }
}
