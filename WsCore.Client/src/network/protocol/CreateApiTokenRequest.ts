import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class CreateApiTokenRequest {
    name: string | null;

    constructor() {
        this.name = null;

    }

    static serialize(value: CreateApiTokenRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: CreateApiTokenRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.name);

    }

    static serializeArray(value: (CreateApiTokenRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (CreateApiTokenRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => CreateApiTokenRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): CreateApiTokenRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): CreateApiTokenRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new CreateApiTokenRequest();
        if (count == 1) {
            value.name = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.name = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (CreateApiTokenRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (CreateApiTokenRequest | null)[] | null {
        return reader.readArray(reader => CreateApiTokenRequest.deserializeCore(reader));
    }
}
