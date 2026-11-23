import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { VoiceParticipantInfo } from "./VoiceParticipantInfo.js";

export class VoiceRoomInfo {
    roomId: string | null;
    participants: (VoiceParticipantInfo | null)[] | null;

    constructor() {
        this.roomId = null;
        this.participants = null;

    }

    static serialize(value: VoiceRoomInfo | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceRoomInfo | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.roomId);
        writer.writeArray(value.participants, (writer, x) => VoiceParticipantInfo.serializeCore(writer, x));

    }

    static serializeArray(value: (VoiceRoomInfo | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceRoomInfo | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceRoomInfo.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceRoomInfo | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceRoomInfo | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceRoomInfo();
        if (count == 2) {
            value.roomId = reader.readString();
            value.participants = reader.readArray(reader => VoiceParticipantInfo.deserializeCore(reader));

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.participants = reader.readArray(reader => VoiceParticipantInfo.deserializeCore(reader)); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceRoomInfo | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceRoomInfo | null)[] | null {
        return reader.readArray(reader => VoiceRoomInfo.deserializeCore(reader));
    }
}
