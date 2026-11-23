import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class CreateChannelRequest {
    name: string | null;
    isPrivate: boolean;
    isVoice: boolean;

    constructor() {
        this.name = null;
        this.isPrivate = false;
        this.isVoice = false;

    }

    static serialize(value: CreateChannelRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: CreateChannelRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.name);
        writer.writeBoolean(value.isPrivate);
        writer.writeBoolean(value.isVoice);

    }

    static serializeArray(value: (CreateChannelRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (CreateChannelRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => CreateChannelRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): CreateChannelRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): CreateChannelRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new CreateChannelRequest();
        if (count == 3) {
            value.name = reader.readString();
            value.isPrivate = reader.readBoolean();
            value.isVoice = reader.readBoolean();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.name = reader.readString(); if (count == 1) return value;
            value.isPrivate = reader.readBoolean(); if (count == 2) return value;
            value.isVoice = reader.readBoolean(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (CreateChannelRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (CreateChannelRequest | null)[] | null {
        return reader.readArray(reader => CreateChannelRequest.deserializeCore(reader));
    }
}
