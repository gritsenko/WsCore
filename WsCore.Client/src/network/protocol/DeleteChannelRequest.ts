import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class DeleteChannelRequest {
    roomId: string | null;

    constructor() {
        this.roomId = null;

    }

    static serialize(value: DeleteChannelRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: DeleteChannelRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.roomId);

    }

    static serializeArray(value: (DeleteChannelRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (DeleteChannelRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => DeleteChannelRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): DeleteChannelRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): DeleteChannelRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new DeleteChannelRequest();
        if (count == 1) {
            value.roomId = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (DeleteChannelRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (DeleteChannelRequest | null)[] | null {
        return reader.readArray(reader => DeleteChannelRequest.deserializeCore(reader));
    }
}
