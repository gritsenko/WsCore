import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { PresenceUserInfo } from "./PresenceUserInfo.js";

export class PresenceSnapshotEvent {
    yourUserId: number;
    users: (PresenceUserInfo | null)[] | null;
    yourLogin: string | null;
    yourLeaderboardHidden: boolean;

    constructor() {
        this.yourUserId = 0;
        this.users = null;
        this.yourLogin = null;
        this.yourLeaderboardHidden = false;

    }

    static serialize(value: PresenceSnapshotEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PresenceSnapshotEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint32(value.yourUserId);
        writer.writeArray(value.users, (writer, x) => PresenceUserInfo.serializeCore(writer, x));
        writer.writeString(value.yourLogin);
        writer.writeBoolean(value.yourLeaderboardHidden);

    }

    static serializeArray(value: (PresenceSnapshotEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PresenceSnapshotEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PresenceSnapshotEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PresenceSnapshotEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PresenceSnapshotEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PresenceSnapshotEvent();
        if (count == 4) {
            value.yourUserId = reader.readUint32();
            value.users = reader.readArray(reader => PresenceUserInfo.deserializeCore(reader));
            value.yourLogin = reader.readString();
            value.yourLeaderboardHidden = reader.readBoolean();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.yourUserId = reader.readUint32(); if (count == 1) return value;
            value.users = reader.readArray(reader => PresenceUserInfo.deserializeCore(reader)); if (count == 2) return value;
            value.yourLogin = reader.readString(); if (count == 3) return value;
            value.yourLeaderboardHidden = reader.readBoolean(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PresenceSnapshotEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PresenceSnapshotEvent | null)[] | null {
        return reader.readArray(reader => PresenceSnapshotEvent.deserializeCore(reader));
    }
}
