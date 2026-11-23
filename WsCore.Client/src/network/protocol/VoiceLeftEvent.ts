import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceLeftEvent {
    roomId: string | null;
    reason: string | null;

    constructor() {
        this.roomId = null;
        this.reason = null;

    }

    static serialize(value: VoiceLeftEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceLeftEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.roomId);
        writer.writeString(value.reason);

    }

    static serializeArray(value: (VoiceLeftEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceLeftEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceLeftEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceLeftEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceLeftEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceLeftEvent();
        if (count == 2) {
            value.roomId = reader.readString();
            value.reason = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.reason = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceLeftEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceLeftEvent | null)[] | null {
        return reader.readArray(reader => VoiceLeftEvent.deserializeCore(reader));
    }
}
