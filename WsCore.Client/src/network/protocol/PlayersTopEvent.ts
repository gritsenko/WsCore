import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PlayersTopEvent {
    playersTop: string | null;

    constructor() {
        this.playersTop = null;

    }

    static serialize(value: PlayersTopEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PlayersTopEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.playersTop);

    }

    static serializeArray(value: (PlayersTopEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PlayersTopEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PlayersTopEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PlayersTopEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PlayersTopEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PlayersTopEvent();
        if (count == 1) {
            value.playersTop = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.playersTop = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PlayersTopEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PlayersTopEvent | null)[] | null {
        return reader.readArray(reader => PlayersTopEvent.deserializeCore(reader));
    }
}
