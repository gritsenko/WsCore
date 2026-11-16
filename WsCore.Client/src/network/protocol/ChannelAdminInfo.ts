import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChannelAdminInfo {
    userId: number;
    rights: number;
    title: string | null;

    constructor() {
        this.userId = 0;
        this.rights = 0;
        this.title = null;

    }

    static serialize(value: ChannelAdminInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChannelAdminInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeUint32(value.userId);
        writer.writeUint8(value.rights);
        writer.writeString(value.title);

    }

    static serializeArray(value: (ChannelAdminInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChannelAdminInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChannelAdminInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChannelAdminInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChannelAdminInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChannelAdminInfo();
        if (count == 3) {
            value.userId = reader.readUint32();
            value.rights = reader.readUint8();
            value.title = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.userId = reader.readUint32(); if (count == 1) return value;
            value.rights = reader.readUint8(); if (count == 2) return value;
            value.title = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChannelAdminInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChannelAdminInfo | null)[] | null {
        return reader.readArray(reader => ChannelAdminInfo.deserializeCore(reader));
    }
}
