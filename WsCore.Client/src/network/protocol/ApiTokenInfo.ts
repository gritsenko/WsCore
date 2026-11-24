import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ApiTokenInfo {
    id: string | null;
    name: string | null;
    createdMs: number;
    lastUsedMs: number;

    constructor() {
        this.id = null;
        this.name = null;
        this.createdMs = 0;
        this.lastUsedMs = 0;

    }

    static serialize(value: ApiTokenInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ApiTokenInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeString(value.id);
        writer.writeString(value.name);
        writer.writeFloat64(value.createdMs);
        writer.writeFloat64(value.lastUsedMs);

    }

    static serializeArray(value: (ApiTokenInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ApiTokenInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ApiTokenInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ApiTokenInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ApiTokenInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ApiTokenInfo();
        if (count == 4) {
            value.id = reader.readString();
            value.name = reader.readString();
            value.createdMs = reader.readFloat64();
            value.lastUsedMs = reader.readFloat64();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readString(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;
            value.createdMs = reader.readFloat64(); if (count == 3) return value;
            value.lastUsedMs = reader.readFloat64(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ApiTokenInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ApiTokenInfo | null)[] | null {
        return reader.readArray(reader => ApiTokenInfo.deserializeCore(reader));
    }
}
