import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class LoginRequest {
    login: string | null;
    password: string | null;
    userKey: string | null;

    constructor() {
        this.login = null;
        this.password = null;
        this.userKey = null;

    }

    static serialize(value: LoginRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: LoginRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.login);
        writer.writeString(value.password);
        writer.writeString(value.userKey);

    }

    static serializeArray(value: (LoginRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (LoginRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => LoginRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): LoginRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): LoginRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new LoginRequest();
        if (count == 3) {
            value.login = reader.readString();
            value.password = reader.readString();
            value.userKey = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.login = reader.readString(); if (count == 1) return value;
            value.password = reader.readString(); if (count == 2) return value;
            value.userKey = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (LoginRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (LoginRequest | null)[] | null {
        return reader.readArray(reader => LoginRequest.deserializeCore(reader));
    }
}
