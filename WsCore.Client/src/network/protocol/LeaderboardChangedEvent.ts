import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class LeaderboardChangedEvent {
    gameId: string | null;
    board: string | null;

    constructor() {
        this.gameId = null;
        this.board = null;

    }

    static serialize(value: LeaderboardChangedEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: LeaderboardChangedEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.gameId);
        writer.writeString(value.board);

    }

    static serializeArray(value: (LeaderboardChangedEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (LeaderboardChangedEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => LeaderboardChangedEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): LeaderboardChangedEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): LeaderboardChangedEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new LeaderboardChangedEvent();
        if (count == 2) {
            value.gameId = reader.readString();
            value.board = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.gameId = reader.readString(); if (count == 1) return value;
            value.board = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (LeaderboardChangedEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (LeaderboardChangedEvent | null)[] | null {
        return reader.readArray(reader => LeaderboardChangedEvent.deserializeCore(reader));
    }
}
