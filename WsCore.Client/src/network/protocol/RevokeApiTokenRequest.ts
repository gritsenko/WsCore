import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class RevokeApiTokenRequest {
    id: string | null;

    constructor() {
        this.id = null;

    }

    static serialize(value: RevokeApiTokenRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: RevokeApiTokenRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.id);

    }

    static serializeArray(value: (RevokeApiTokenRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (RevokeApiTokenRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => RevokeApiTokenRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): RevokeApiTokenRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): RevokeApiTokenRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new RevokeApiTokenRequest();
        if (count == 1) {
            value.id = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (RevokeApiTokenRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (RevokeApiTokenRequest | null)[] | null {
        return reader.readArray(reader => RevokeApiTokenRequest.deserializeCore(reader));
    }
}
