import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ModerationResultEvent {
    action: number;
    success: boolean;
    error: string | null;
    roomId: string | null;

    constructor() {
        this.action = 0;
        this.success = false;
        this.error = null;
        this.roomId = null;

    }

    static serialize(value: ModerationResultEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ModerationResultEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint8(value.action);
        writer.writeBoolean(value.success);
        writer.writeString(value.error);
        writer.writeString(value.roomId);

    }

    static serializeArray(value: (ModerationResultEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ModerationResultEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ModerationResultEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ModerationResultEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ModerationResultEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ModerationResultEvent();
        if (count == 4) {
            value.action = reader.readUint8();
            value.success = reader.readBoolean();
            value.error = reader.readString();
            value.roomId = reader.readString();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.action = reader.readUint8(); if (count == 1) return value;
            value.success = reader.readBoolean(); if (count == 2) return value;
            value.error = reader.readString(); if (count == 3) return value;
            value.roomId = reader.readString(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ModerationResultEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ModerationResultEvent | null)[] | null {
        return reader.readArray(reader => ModerationResultEvent.deserializeCore(reader));
    }
}
