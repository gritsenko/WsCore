import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PushUnsubscribeRequest {
    endpoint: string | null;

    constructor() {
        this.endpoint = null;

    }

    static serialize(value: PushUnsubscribeRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PushUnsubscribeRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.endpoint);

    }

    static serializeArray(value: (PushUnsubscribeRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PushUnsubscribeRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PushUnsubscribeRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PushUnsubscribeRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PushUnsubscribeRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PushUnsubscribeRequest();
        if (count == 1) {
            value.endpoint = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.endpoint = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PushUnsubscribeRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PushUnsubscribeRequest | null)[] | null {
        return reader.readArray(reader => PushUnsubscribeRequest.deserializeCore(reader));
    }
}
