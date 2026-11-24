import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class LeaderboardConfigRequest {
    requestId: number;
    gameId: string | null;
    board: string | null;
    action: string | null;
    title: string | null;
    invertSortOrder: boolean;
    scoreType: string | null;
    decimalOffset: number;

    constructor() {
        this.requestId = 0;
        this.gameId = null;
        this.board = null;
        this.action = null;
        this.title = null;
        this.invertSortOrder = false;
        this.scoreType = null;
        this.decimalOffset = 0;

    }

    static serialize(value: LeaderboardConfigRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: LeaderboardConfigRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(8);
        writer.writeUint32(value.requestId);
        writer.writeString(value.gameId);
        writer.writeString(value.board);
        writer.writeString(value.action);
        writer.writeString(value.title);
        writer.writeBoolean(value.invertSortOrder);
        writer.writeString(value.scoreType);
        writer.writeInt32(value.decimalOffset);

    }

    static serializeArray(value: (LeaderboardConfigRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (LeaderboardConfigRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => LeaderboardConfigRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): LeaderboardConfigRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): LeaderboardConfigRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new LeaderboardConfigRequest();
        if (count == 8) {
            value.requestId = reader.readUint32();
            value.gameId = reader.readString();
            value.board = reader.readString();
            value.action = reader.readString();
            value.title = reader.readString();
            value.invertSortOrder = reader.readBoolean();
            value.scoreType = reader.readString();
            value.decimalOffset = reader.readInt32();

        }
        else if (count > 8) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.requestId = reader.readUint32(); if (count == 1) return value;
            value.gameId = reader.readString(); if (count == 2) return value;
            value.board = reader.readString(); if (count == 3) return value;
            value.action = reader.readString(); if (count == 4) return value;
            value.title = reader.readString(); if (count == 5) return value;
            value.invertSortOrder = reader.readBoolean(); if (count == 6) return value;
            value.scoreType = reader.readString(); if (count == 7) return value;
            value.decimalOffset = reader.readInt32(); if (count == 8) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (LeaderboardConfigRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (LeaderboardConfigRequest | null)[] | null {
        return reader.readArray(reader => LeaderboardConfigRequest.deserializeCore(reader));
    }
}
