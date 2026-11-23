import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceStateRequest {
    muted: boolean;
    deafened: boolean;

    constructor() {
        this.muted = false;
        this.deafened = false;

    }

    static serialize(value: VoiceStateRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceStateRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeBoolean(value.muted);
        writer.writeBoolean(value.deafened);

    }

    static serializeArray(value: (VoiceStateRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceStateRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceStateRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceStateRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceStateRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceStateRequest();
        if (count == 2) {
            value.muted = reader.readBoolean();
            value.deafened = reader.readBoolean();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.muted = reader.readBoolean(); if (count == 1) return value;
            value.deafened = reader.readBoolean(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceStateRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceStateRequest | null)[] | null {
        return reader.readArray(reader => VoiceStateRequest.deserializeCore(reader));
    }
}
