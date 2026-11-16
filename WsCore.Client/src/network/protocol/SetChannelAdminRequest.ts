import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetChannelAdminRequest {
    roomId: string | null;
    userId: number;
    rights: number;
    title: string | null;

    constructor() {
        this.roomId = null;
        this.userId = 0;
        this.rights = 0;
        this.title = null;

    }

    static serialize(value: SetChannelAdminRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetChannelAdminRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeString(value.roomId);
        writer.writeUint32(value.userId);
        writer.writeUint8(value.rights);
        writer.writeString(value.title);

    }

    static serializeArray(value: (SetChannelAdminRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetChannelAdminRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetChannelAdminRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetChannelAdminRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetChannelAdminRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetChannelAdminRequest();
        if (count == 4) {
            value.roomId = reader.readString();
            value.userId = reader.readUint32();
            value.rights = reader.readUint8();
            value.title = reader.readString();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.userId = reader.readUint32(); if (count == 2) return value;
            value.rights = reader.readUint8(); if (count == 3) return value;
            value.title = reader.readString(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetChannelAdminRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetChannelAdminRequest | null)[] | null {
        return reader.readArray(reader => SetChannelAdminRequest.deserializeCore(reader));
    }
}
