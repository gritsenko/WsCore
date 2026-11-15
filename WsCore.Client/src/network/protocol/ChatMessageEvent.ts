import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChatMessageEvent {
    clientId: number;
    message: string | null;
    id: number;
    userId: number;
    name: string | null;
    sentAtMs: number;

    constructor() {
        this.clientId = 0;
        this.message = null;
        this.id = 0;
        this.userId = 0;
        this.name = null;
        this.sentAtMs = 0;

    }

    static serialize(value: ChatMessageEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChatMessageEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(6);
        writer.writeUint32(value.clientId);
        writer.writeString(value.message);
        writer.writeUint32(value.id);
        writer.writeUint32(value.userId);
        writer.writeString(value.name);
        writer.writeFloat64(value.sentAtMs);

    }

    static serializeArray(value: (ChatMessageEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChatMessageEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChatMessageEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChatMessageEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChatMessageEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChatMessageEvent();
        if (count == 6) {
            value.clientId = reader.readUint32();
            value.message = reader.readString();
            value.id = reader.readUint32();
            value.userId = reader.readUint32();
            value.name = reader.readString();
            value.sentAtMs = reader.readFloat64();

        }
        else if (count > 6) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.clientId = reader.readUint32(); if (count == 1) return value;
            value.message = reader.readString(); if (count == 2) return value;
            value.id = reader.readUint32(); if (count == 3) return value;
            value.userId = reader.readUint32(); if (count == 4) return value;
            value.name = reader.readString(); if (count == 5) return value;
            value.sentAtMs = reader.readFloat64(); if (count == 6) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChatMessageEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChatMessageEvent | null)[] | null {
        return reader.readArray(reader => ChatMessageEvent.deserializeCore(reader));
    }
}
