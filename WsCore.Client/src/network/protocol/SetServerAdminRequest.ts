import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetServerAdminRequest {
    userId: number;
    isAdmin: boolean;

    constructor() {
        this.userId = 0;
        this.isAdmin = false;

    }

    static serialize(value: SetServerAdminRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetServerAdminRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeUint32(value.userId);
        writer.writeBoolean(value.isAdmin);

    }

    static serializeArray(value: (SetServerAdminRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetServerAdminRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetServerAdminRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetServerAdminRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetServerAdminRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetServerAdminRequest();
        if (count == 2) {
            value.userId = reader.readUint32();
            value.isAdmin = reader.readBoolean();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.userId = reader.readUint32(); if (count == 1) return value;
            value.isAdmin = reader.readBoolean(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetServerAdminRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetServerAdminRequest | null)[] | null {
        return reader.readArray(reader => SetServerAdminRequest.deserializeCore(reader));
    }
}
