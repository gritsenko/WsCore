import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class LeaderboardRequest {
    requestId: number;
    gameId: string | null;
    board: string | null;
    op: string | null;
    score: number;
    extraData: string | null;
    top: number;
    around: number;
    includeUser: boolean;

    constructor() {
        this.requestId = 0;
        this.gameId = null;
        this.board = null;
        this.op = null;
        this.score = 0;
        this.extraData = null;
        this.top = 0;
        this.around = 0;
        this.includeUser = false;

    }

    static serialize(value: LeaderboardRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: LeaderboardRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(9);
        writer.writeUint32(value.requestId);
        writer.writeString(value.gameId);
        writer.writeString(value.board);
        writer.writeString(value.op);
        writer.writeFloat64(value.score);
        writer.writeString(value.extraData);
        writer.writeInt32(value.top);
        writer.writeInt32(value.around);
        writer.writeBoolean(value.includeUser);

    }

    static serializeArray(value: (LeaderboardRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (LeaderboardRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => LeaderboardRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): LeaderboardRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): LeaderboardRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new LeaderboardRequest();
        if (count == 9) {
            value.requestId = reader.readUint32();
            value.gameId = reader.readString();
            value.board = reader.readString();
            value.op = reader.readString();
            value.score = reader.readFloat64();
            value.extraData = reader.readString();
            value.top = reader.readInt32();
            value.around = reader.readInt32();
            value.includeUser = reader.readBoolean();

        }
        else if (count > 9) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.requestId = reader.readUint32(); if (count == 1) return value;
            value.gameId = reader.readString(); if (count == 2) return value;
            value.board = reader.readString(); if (count == 3) return value;
            value.op = reader.readString(); if (count == 4) return value;
            value.score = reader.readFloat64(); if (count == 5) return value;
            value.extraData = reader.readString(); if (count == 6) return value;
            value.top = reader.readInt32(); if (count == 7) return value;
            value.around = reader.readInt32(); if (count == 8) return value;
            value.includeUser = reader.readBoolean(); if (count == 9) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (LeaderboardRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (LeaderboardRequest | null)[] | null {
        return reader.readArray(reader => LeaderboardRequest.deserializeCore(reader));
    }
}
