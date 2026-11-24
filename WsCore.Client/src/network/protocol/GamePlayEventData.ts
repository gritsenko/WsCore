import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class GamePlayEventData {
    name: string | null;
    level: string | null;
    params: string | null;

    constructor() {
        this.name = null;
        this.level = null;
        this.params = null;

    }

    static serialize(value: GamePlayEventData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GamePlayEventData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeString(value.name);
        writer.writeString(value.level);
        writer.writeString(value.params);

    }

    static serializeArray(value: (GamePlayEventData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GamePlayEventData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GamePlayEventData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GamePlayEventData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GamePlayEventData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GamePlayEventData();
        if (count == 3) {
            value.name = reader.readString();
            value.level = reader.readString();
            value.params = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.name = reader.readString(); if (count == 1) return value;
            value.level = reader.readString(); if (count == 2) return value;
            value.params = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GamePlayEventData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GamePlayEventData | null)[] | null {
        return reader.readArray(reader => GamePlayEventData.deserializeCore(reader));
    }
}
