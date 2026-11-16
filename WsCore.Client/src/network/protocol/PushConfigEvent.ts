import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PushConfigEvent {
    publicKey: string | null;

    constructor() {
        this.publicKey = null;

    }

    static serialize(value: PushConfigEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PushConfigEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeString(value.publicKey);

    }

    static serializeArray(value: (PushConfigEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PushConfigEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PushConfigEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PushConfigEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PushConfigEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PushConfigEvent();
        if (count == 1) {
            value.publicKey = reader.readString();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.publicKey = reader.readString(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PushConfigEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PushConfigEvent | null)[] | null {
        return reader.readArray(reader => PushConfigEvent.deserializeCore(reader));
    }
}
