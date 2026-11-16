import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PresenceUserInfo {
    userId: number;
    name: string | null;
    status: number;
    roomId: string | null;
    lastSeenMs: number;
    about: string | null;
    avatarVersion: number;
    login: string | null;
    isAdmin: boolean;

    constructor() {
        this.userId = 0;
        this.name = null;
        this.status = 0;
        this.roomId = null;
        this.lastSeenMs = 0;
        this.about = null;
        this.avatarVersion = 0;
        this.login = null;
        this.isAdmin = false;

    }

    static serialize(value: PresenceUserInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PresenceUserInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(9);
        writer.writeUint32(value.userId);
        writer.writeString(value.name);
        writer.writeUint8(value.status);
        writer.writeString(value.roomId);
        writer.writeFloat64(value.lastSeenMs);
        writer.writeString(value.about);
        writer.writeUint32(value.avatarVersion);
        writer.writeString(value.login);
        writer.writeBoolean(value.isAdmin);

    }

    static serializeArray(value: (PresenceUserInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PresenceUserInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PresenceUserInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PresenceUserInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PresenceUserInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PresenceUserInfo();
        if (count == 9) {
            value.userId = reader.readUint32();
            value.name = reader.readString();
            value.status = reader.readUint8();
            value.roomId = reader.readString();
            value.lastSeenMs = reader.readFloat64();
            value.about = reader.readString();
            value.avatarVersion = reader.readUint32();
            value.login = reader.readString();
            value.isAdmin = reader.readBoolean();

        }
        else if (count > 9) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.userId = reader.readUint32(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;
            value.status = reader.readUint8(); if (count == 3) return value;
            value.roomId = reader.readString(); if (count == 4) return value;
            value.lastSeenMs = reader.readFloat64(); if (count == 5) return value;
            value.about = reader.readString(); if (count == 6) return value;
            value.avatarVersion = reader.readUint32(); if (count == 7) return value;
            value.login = reader.readString(); if (count == 8) return value;
            value.isAdmin = reader.readBoolean(); if (count == 9) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PresenceUserInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PresenceUserInfo | null)[] | null {
        return reader.readArray(reader => PresenceUserInfo.deserializeCore(reader));
    }
}
