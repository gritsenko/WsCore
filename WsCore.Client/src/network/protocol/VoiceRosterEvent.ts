import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { VoiceRoomInfo } from "./VoiceRoomInfo.js";

export class VoiceRosterEvent {
    reset: boolean;
    rooms: (VoiceRoomInfo | null)[] | null;

    constructor() {
        this.reset = false;
        this.rooms = null;

    }

    static serialize(value: VoiceRosterEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceRosterEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeBoolean(value.reset);
        writer.writeArray(value.rooms, (writer, x) => VoiceRoomInfo.serializeCore(writer, x));

    }

    static serializeArray(value: (VoiceRosterEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceRosterEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceRosterEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceRosterEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceRosterEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceRosterEvent();
        if (count == 2) {
            value.reset = reader.readBoolean();
            value.rooms = reader.readArray(reader => VoiceRoomInfo.deserializeCore(reader));

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.reset = reader.readBoolean(); if (count == 1) return value;
            value.rooms = reader.readArray(reader => VoiceRoomInfo.deserializeCore(reader)); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceRosterEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceRosterEvent | null)[] | null {
        return reader.readArray(reader => VoiceRosterEvent.deserializeCore(reader));
    }
}
