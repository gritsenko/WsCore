import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { ChannelPermissionsInfo } from "./ChannelPermissionsInfo.js";

export class ChannelPermissionsEvent {
    reset: boolean;
    channels: (ChannelPermissionsInfo | null)[] | null;

    constructor() {
        this.reset = false;
        this.channels = null;

    }

    static serialize(value: ChannelPermissionsEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChannelPermissionsEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeBoolean(value.reset);
        writer.writeArray(value.channels, (writer, x) => ChannelPermissionsInfo.serializeCore(writer, x));

    }

    static serializeArray(value: (ChannelPermissionsEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChannelPermissionsEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChannelPermissionsEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChannelPermissionsEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChannelPermissionsEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChannelPermissionsEvent();
        if (count == 2) {
            value.reset = reader.readBoolean();
            value.channels = reader.readArray(reader => ChannelPermissionsInfo.deserializeCore(reader));

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.reset = reader.readBoolean(); if (count == 1) return value;
            value.channels = reader.readArray(reader => ChannelPermissionsInfo.deserializeCore(reader)); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChannelPermissionsEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChannelPermissionsEvent | null)[] | null {
        return reader.readArray(reader => ChannelPermissionsEvent.deserializeCore(reader));
    }
}
