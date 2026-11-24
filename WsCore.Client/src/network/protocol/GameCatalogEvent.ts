import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { GameInfo } from "./GameInfo.js";

export class GameCatalogEvent {
    games: (GameInfo | null)[] | null;

    constructor() {
        this.games = null;

    }

    static serialize(value: GameCatalogEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GameCatalogEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeArray(value.games, (writer, x) => GameInfo.serializeCore(writer, x));

    }

    static serializeArray(value: (GameCatalogEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GameCatalogEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GameCatalogEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GameCatalogEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GameCatalogEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GameCatalogEvent();
        if (count == 1) {
            value.games = reader.readArray(reader => GameInfo.deserializeCore(reader));

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.games = reader.readArray(reader => GameInfo.deserializeCore(reader)); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GameCatalogEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GameCatalogEvent | null)[] | null {
        return reader.readArray(reader => GameCatalogEvent.deserializeCore(reader));
    }
}
