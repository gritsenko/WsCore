import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class UpdateChannelRequest {
    roomId: string | null;
    name: string | null;
    isPrivate: boolean;

    constructor() {
        this.roomId = null;
        this.name = null;
        this.isPrivate = false;

    }

    static serialize(value: UpdateChannelRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: UpdateChannelRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.roomId);
        writer.writeString(value.name);
        writer.writeBoolean(value.isPrivate);

    }

    static serializeArray(value: (UpdateChannelRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (UpdateChannelRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => UpdateChannelRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): UpdateChannelRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): UpdateChannelRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new UpdateChannelRequest();
        if (count == 3) {
            value.roomId = reader.readString();
            value.name = reader.readString();
            value.isPrivate = reader.readBoolean();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;
            value.isPrivate = reader.readBoolean(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (UpdateChannelRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (UpdateChannelRequest | null)[] | null {
        return reader.readArray(reader => UpdateChannelRequest.deserializeCore(reader));
    }
}
