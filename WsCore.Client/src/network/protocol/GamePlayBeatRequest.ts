import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class GamePlayBeatRequest {
    gameId: string | null;
    sessionId: string | null;
    releaseNo: number;
    activeMs: number;
    device: string | null;
    source: string | null;
    visitorId: string | null;
    ended: boolean;

    constructor() {
        this.gameId = null;
        this.sessionId = null;
        this.releaseNo = 0;
        this.activeMs = 0;
        this.device = null;
        this.source = null;
        this.visitorId = null;
        this.ended = false;

    }

    static serialize(value: GamePlayBeatRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GamePlayBeatRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(8);
        writer.writeString(value.gameId);
        writer.writeString(value.sessionId);
        writer.writeUint32(value.releaseNo);
        writer.writeFloat64(value.activeMs);
        writer.writeString(value.device);
        writer.writeString(value.source);
        writer.writeString(value.visitorId);
        writer.writeBoolean(value.ended);

    }

    static serializeArray(value: (GamePlayBeatRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GamePlayBeatRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GamePlayBeatRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GamePlayBeatRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GamePlayBeatRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GamePlayBeatRequest();
        if (count == 8) {
            value.gameId = reader.readString();
            value.sessionId = reader.readString();
            value.releaseNo = reader.readUint32();
            value.activeMs = reader.readFloat64();
            value.device = reader.readString();
            value.source = reader.readString();
            value.visitorId = reader.readString();
            value.ended = reader.readBoolean();

        }
        else if (count > 8) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.gameId = reader.readString(); if (count == 1) return value;
            value.sessionId = reader.readString(); if (count == 2) return value;
            value.releaseNo = reader.readUint32(); if (count == 3) return value;
            value.activeMs = reader.readFloat64(); if (count == 4) return value;
            value.device = reader.readString(); if (count == 5) return value;
            value.source = reader.readString(); if (count == 6) return value;
            value.visitorId = reader.readString(); if (count == 7) return value;
            value.ended = reader.readBoolean(); if (count == 8) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GamePlayBeatRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GamePlayBeatRequest | null)[] | null {
        return reader.readArray(reader => GamePlayBeatRequest.deserializeCore(reader));
    }
}
