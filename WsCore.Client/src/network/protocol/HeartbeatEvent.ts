import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class HeartbeatEvent {

    constructor() {

    }

    static serialize(value: HeartbeatEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: HeartbeatEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(0);

    }

    static serializeArray(value: (HeartbeatEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (HeartbeatEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => HeartbeatEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): HeartbeatEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): HeartbeatEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new HeartbeatEvent();
        if (count == 0) {

        }
        else if (count > 0) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (HeartbeatEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (HeartbeatEvent | null)[] | null {
        return reader.readArray(reader => HeartbeatEvent.deserializeCore(reader));
    }
}
