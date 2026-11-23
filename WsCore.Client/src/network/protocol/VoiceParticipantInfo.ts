import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceParticipantInfo {
    clientId: number;
    userId: number;
    muted: boolean;
    deafened: boolean;

    constructor() {
        this.clientId = 0;
        this.userId = 0;
        this.muted = false;
        this.deafened = false;

    }

    static serialize(value: VoiceParticipantInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceParticipantInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint32(value.clientId);
        writer.writeUint32(value.userId);
        writer.writeBoolean(value.muted);
        writer.writeBoolean(value.deafened);

    }

    static serializeArray(value: (VoiceParticipantInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceParticipantInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceParticipantInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceParticipantInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceParticipantInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceParticipantInfo();
        if (count == 4) {
            value.clientId = reader.readUint32();
            value.userId = reader.readUint32();
            value.muted = reader.readBoolean();
            value.deafened = reader.readBoolean();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.clientId = reader.readUint32(); if (count == 1) return value;
            value.userId = reader.readUint32(); if (count == 2) return value;
            value.muted = reader.readBoolean(); if (count == 3) return value;
            value.deafened = reader.readBoolean(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceParticipantInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceParticipantInfo | null)[] | null {
        return reader.readArray(reader => VoiceParticipantInfo.deserializeCore(reader));
    }
}
