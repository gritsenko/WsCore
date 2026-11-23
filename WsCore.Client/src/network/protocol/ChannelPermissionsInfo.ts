import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { ChannelAdminInfo } from "./ChannelAdminInfo.js";
import { ChannelRestrictionInfo } from "./ChannelRestrictionInfo.js";

export class ChannelPermissionsInfo {
    roomId: string | null;
    defaultPermissions: number;
    admins: (ChannelAdminInfo | null)[] | null;
    restrictions: (ChannelRestrictionInfo | null)[] | null;
    isPrivate: boolean;
    members: number[] | null;

    constructor() {
        this.roomId = null;
        this.defaultPermissions = 0;
        this.admins = null;
        this.restrictions = null;
        this.isPrivate = false;
        this.members = null;

    }

    static serialize(value: ChannelPermissionsInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChannelPermissionsInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(6);
        writer.writeString(value.roomId);
        writer.writeUint8(value.defaultPermissions);
        writer.writeArray(value.admins, (writer, x) => ChannelAdminInfo.serializeCore(writer, x));
        writer.writeArray(value.restrictions, (writer, x) => ChannelRestrictionInfo.serializeCore(writer, x));
        writer.writeBoolean(value.isPrivate);
        writer.writeArray(value.members, (writer, x) => writer.writeUint32(x));

    }

    static serializeArray(value: (ChannelPermissionsInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChannelPermissionsInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChannelPermissionsInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChannelPermissionsInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChannelPermissionsInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChannelPermissionsInfo();
        if (count == 6) {
            value.roomId = reader.readString();
            value.defaultPermissions = reader.readUint8();
            value.admins = reader.readArray(reader => ChannelAdminInfo.deserializeCore(reader));
            value.restrictions = reader.readArray(reader => ChannelRestrictionInfo.deserializeCore(reader));
            value.isPrivate = reader.readBoolean();
            value.members = reader.readArray(reader => reader.readUint32());

        }
        else if (count > 6) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.defaultPermissions = reader.readUint8(); if (count == 2) return value;
            value.admins = reader.readArray(reader => ChannelAdminInfo.deserializeCore(reader)); if (count == 3) return value;
            value.restrictions = reader.readArray(reader => ChannelRestrictionInfo.deserializeCore(reader)); if (count == 4) return value;
            value.isPrivate = reader.readBoolean(); if (count == 5) return value;
            value.members = reader.readArray(reader => reader.readUint32()); if (count == 6) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChannelPermissionsInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChannelPermissionsInfo | null)[] | null {
        return reader.readArray(reader => ChannelPermissionsInfo.deserializeCore(reader));
    }
}
