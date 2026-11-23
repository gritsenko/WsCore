import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceSignalEvent {
    fromClientId: number;
    kind: number;
    data: string | null;

    constructor() {
        this.fromClientId = 0;
        this.kind = 0;
        this.data = null;

    }

    static serialize(value: VoiceSignalEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceSignalEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeUint32(value.fromClientId);
        writer.writeUint8(value.kind);
        writer.writeString(value.data);

    }

    static serializeArray(value: (VoiceSignalEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceSignalEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceSignalEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceSignalEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceSignalEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceSignalEvent();
        if (count == 3) {
            value.fromClientId = reader.readUint32();
            value.kind = reader.readUint8();
            value.data = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.fromClientId = reader.readUint32(); if (count == 1) return value;
            value.kind = reader.readUint8(); if (count == 2) return value;
            value.data = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceSignalEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceSignalEvent | null)[] | null {
        return reader.readArray(reader => VoiceSignalEvent.deserializeCore(reader));
    }
}
