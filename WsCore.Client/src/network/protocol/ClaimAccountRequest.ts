import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ClaimAccountRequest {
    login: string | null;
    password: string | null;

    constructor() {
        this.login = null;
        this.password = null;

    }

    static serialize(value: ClaimAccountRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ClaimAccountRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.login);
        writer.writeString(value.password);

    }

    static serializeArray(value: (ClaimAccountRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ClaimAccountRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ClaimAccountRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ClaimAccountRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ClaimAccountRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ClaimAccountRequest();
        if (count == 2) {
            value.login = reader.readString();
            value.password = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.login = reader.readString(); if (count == 1) return value;
            value.password = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ClaimAccountRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ClaimAccountRequest | null)[] | null {
        return reader.readArray(reader => ClaimAccountRequest.deserializeCore(reader));
    }
}
