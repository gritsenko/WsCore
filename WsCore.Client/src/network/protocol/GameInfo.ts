import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class GameInfo {
    id: string | null;
    slug: string | null;
    title: string | null;
    tagline: string | null;
    description: string | null;
    tags: (string | null)[] | null;
    isPublic: boolean;
    roomId: string | null;
    ownerUserId: number;
    releaseNo: number;
    version: string | null;
    playUrl: string | null;
    createdMs: number;
    updatedMs: number;
    plays: number;

    constructor() {
        this.id = null;
        this.slug = null;
        this.title = null;
        this.tagline = null;
        this.description = null;
        this.tags = null;
        this.isPublic = false;
        this.roomId = null;
        this.ownerUserId = 0;
        this.releaseNo = 0;
        this.version = null;
        this.playUrl = null;
        this.createdMs = 0;
        this.updatedMs = 0;
        this.plays = 0;

    }

    static serialize(value: GameInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GameInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(15);
        writer.writeString(value.id);
        writer.writeString(value.slug);
        writer.writeString(value.title);
        writer.writeString(value.tagline);
        writer.writeString(value.description);
        writer.writeArray(value.tags, (writer, x) => writer.writeString(x));
        writer.writeBoolean(value.isPublic);
        writer.writeString(value.roomId);
        writer.writeUint32(value.ownerUserId);
        writer.writeUint32(value.releaseNo);
        writer.writeString(value.version);
        writer.writeString(value.playUrl);
        writer.writeFloat64(value.createdMs);
        writer.writeFloat64(value.updatedMs);
        writer.writeUint32(value.plays);

    }

    static serializeArray(value: (GameInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GameInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GameInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GameInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GameInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GameInfo();
        if (count == 15) {
            value.id = reader.readString();
            value.slug = reader.readString();
            value.title = reader.readString();
            value.tagline = reader.readString();
            value.description = reader.readString();
            value.tags = reader.readArray(reader => reader.readString());
            value.isPublic = reader.readBoolean();
            value.roomId = reader.readString();
            value.ownerUserId = reader.readUint32();
            value.releaseNo = reader.readUint32();
            value.version = reader.readString();
            value.playUrl = reader.readString();
            value.createdMs = reader.readFloat64();
            value.updatedMs = reader.readFloat64();
            value.plays = reader.readUint32();

        }
        else if (count > 15) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readString(); if (count == 1) return value;
            value.slug = reader.readString(); if (count == 2) return value;
            value.title = reader.readString(); if (count == 3) return value;
            value.tagline = reader.readString(); if (count == 4) return value;
            value.description = reader.readString(); if (count == 5) return value;
            value.tags = reader.readArray(reader => reader.readString()); if (count == 6) return value;
            value.isPublic = reader.readBoolean(); if (count == 7) return value;
            value.roomId = reader.readString(); if (count == 8) return value;
            value.ownerUserId = reader.readUint32(); if (count == 9) return value;
            value.releaseNo = reader.readUint32(); if (count == 10) return value;
            value.version = reader.readString(); if (count == 11) return value;
            value.playUrl = reader.readString(); if (count == 12) return value;
            value.createdMs = reader.readFloat64(); if (count == 13) return value;
            value.updatedMs = reader.readFloat64(); if (count == 14) return value;
            value.plays = reader.readUint32(); if (count == 15) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GameInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GameInfo | null)[] | null {
        return reader.readArray(reader => GameInfo.deserializeCore(reader));
    }
}
