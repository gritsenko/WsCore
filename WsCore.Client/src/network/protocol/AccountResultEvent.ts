import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class AccountResultEvent {
    action: number;
    success: boolean;
    error: string | null;
    login: string | null;

    constructor() {
        this.action = 0;
        this.success = false;
        this.error = null;
        this.login = null;

    }

    static serialize(value: AccountResultEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: AccountResultEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint8(value.action);
        writer.writeBoolean(value.success);
        writer.writeString(value.error);
        writer.writeString(value.login);

    }

    static serializeArray(value: (AccountResultEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (AccountResultEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => AccountResultEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): AccountResultEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): AccountResultEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new AccountResultEvent();
        if (count == 4) {
            value.action = reader.readUint8();
            value.success = reader.readBoolean();
            value.error = reader.readString();
            value.login = reader.readString();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.action = reader.readUint8(); if (count == 1) return value;
            value.success = reader.readBoolean(); if (count == 2) return value;
            value.error = reader.readString(); if (count == 3) return value;
            value.login = reader.readString(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (AccountResultEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (AccountResultEvent | null)[] | null {
        return reader.readArray(reader => AccountResultEvent.deserializeCore(reader));
    }
}
