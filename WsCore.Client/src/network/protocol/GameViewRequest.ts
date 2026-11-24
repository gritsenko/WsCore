import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class GameViewRequest {
    gameId: string | null;
    source: string | null;
    visitorId: string | null;

    constructor() {
        this.gameId = null;
        this.source = null;
        this.visitorId = null;

    }

    static serialize(value: GameViewRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GameViewRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.gameId);
        writer.writeString(value.source);
        writer.writeString(value.visitorId);

    }

    static serializeArray(value: (GameViewRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GameViewRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GameViewRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GameViewRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GameViewRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GameViewRequest();
        if (count == 3) {
            value.gameId = reader.readString();
            value.source = reader.readString();
            value.visitorId = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.gameId = reader.readString(); if (count == 1) return value;
            value.source = reader.readString(); if (count == 2) return value;
            value.visitorId = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GameViewRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GameViewRequest | null)[] | null {
        return reader.readArray(reader => GameViewRequest.deserializeCore(reader));
    }
}
