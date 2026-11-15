import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class IdentifyRequest {
    userKey: string | null;
    name: string | null;

    constructor() {
        this.userKey = null;
        this.name = null;

    }

    static serialize(value: IdentifyRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: IdentifyRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.userKey);
        writer.writeString(value.name);

    }

    static serializeArray(value: (IdentifyRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (IdentifyRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => IdentifyRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): IdentifyRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): IdentifyRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new IdentifyRequest();
        if (count == 2) {
            value.userKey = reader.readString();
            value.name = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.userKey = reader.readString(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (IdentifyRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (IdentifyRequest | null)[] | null {
        return reader.readArray(reader => IdentifyRequest.deserializeCore(reader));
    }
}
