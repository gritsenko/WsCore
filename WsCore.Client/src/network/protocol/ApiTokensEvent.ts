import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { ApiTokenInfo } from "./ApiTokenInfo.js";

export class ApiTokensEvent {
    tokens: (ApiTokenInfo | null)[] | null;
    newToken: string | null;
    error: string | null;

    constructor() {
        this.tokens = null;
        this.newToken = null;
        this.error = null;

    }

    static serialize(value: ApiTokensEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ApiTokensEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeArray(value.tokens, (writer, x) => ApiTokenInfo.serializeCore(writer, x));
        writer.writeString(value.newToken);
        writer.writeString(value.error);

    }

    static serializeArray(value: (ApiTokensEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ApiTokensEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ApiTokensEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ApiTokensEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ApiTokensEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ApiTokensEvent();
        if (count == 3) {
            value.tokens = reader.readArray(reader => ApiTokenInfo.deserializeCore(reader));
            value.newToken = reader.readString();
            value.error = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.tokens = reader.readArray(reader => ApiTokenInfo.deserializeCore(reader)); if (count == 1) return value;
            value.newToken = reader.readString(); if (count == 2) return value;
            value.error = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ApiTokensEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ApiTokensEvent | null)[] | null {
        return reader.readArray(reader => ApiTokensEvent.deserializeCore(reader));
    }
}
