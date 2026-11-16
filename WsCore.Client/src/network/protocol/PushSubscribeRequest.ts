import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PushSubscribeRequest {
    endpoint: string | null;
    p256dh: string | null;
    auth: string | null;

    constructor() {
        this.endpoint = null;
        this.p256dh = null;
        this.auth = null;

    }

    static serialize(value: PushSubscribeRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PushSubscribeRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.endpoint);
        writer.writeString(value.p256dh);
        writer.writeString(value.auth);

    }

    static serializeArray(value: (PushSubscribeRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PushSubscribeRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PushSubscribeRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PushSubscribeRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PushSubscribeRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PushSubscribeRequest();
        if (count == 3) {
            value.endpoint = reader.readString();
            value.p256dh = reader.readString();
            value.auth = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.endpoint = reader.readString(); if (count == 1) return value;
            value.p256dh = reader.readString(); if (count == 2) return value;
            value.auth = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PushSubscribeRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PushSubscribeRequest | null)[] | null {
        return reader.readArray(reader => PushSubscribeRequest.deserializeCore(reader));
    }
}
