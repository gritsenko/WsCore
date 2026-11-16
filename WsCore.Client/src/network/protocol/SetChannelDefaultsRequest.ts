import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetChannelDefaultsRequest {
    roomId: string | null;
    defaultPermissions: number;

    constructor() {
        this.roomId = null;
        this.defaultPermissions = 0;

    }

    static serialize(value: SetChannelDefaultsRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetChannelDefaultsRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.roomId);
        writer.writeUint8(value.defaultPermissions);

    }

    static serializeArray(value: (SetChannelDefaultsRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetChannelDefaultsRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetChannelDefaultsRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetChannelDefaultsRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetChannelDefaultsRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetChannelDefaultsRequest();
        if (count == 2) {
            value.roomId = reader.readString();
            value.defaultPermissions = reader.readUint8();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.defaultPermissions = reader.readUint8(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetChannelDefaultsRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetChannelDefaultsRequest | null)[] | null {
        return reader.readArray(reader => SetChannelDefaultsRequest.deserializeCore(reader));
    }
}
