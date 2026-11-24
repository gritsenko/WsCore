import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { GamePlayEventData } from "./GamePlayEventData.js";

export class GamePlayEventsRequest {
    sessionId: string | null;
    events: (GamePlayEventData | null)[] | null;

    constructor() {
        this.sessionId = null;
        this.events = null;

    }

    static serialize(value: GamePlayEventsRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GamePlayEventsRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.sessionId);
        writer.writeArray(value.events, (writer, x) => GamePlayEventData.serializeCore(writer, x));

    }

    static serializeArray(value: (GamePlayEventsRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GamePlayEventsRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GamePlayEventsRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GamePlayEventsRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GamePlayEventsRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GamePlayEventsRequest();
        if (count == 2) {
            value.sessionId = reader.readString();
            value.events = reader.readArray(reader => GamePlayEventData.deserializeCore(reader));

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.sessionId = reader.readString(); if (count == 1) return value;
            value.events = reader.readArray(reader => GamePlayEventData.deserializeCore(reader)); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GamePlayEventsRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GamePlayEventsRequest | null)[] | null {
        return reader.readArray(reader => GamePlayEventsRequest.deserializeCore(reader));
    }
}
