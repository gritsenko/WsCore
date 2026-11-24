import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChatMessageData {
    id: number;
    userId: number;
    name: string | null;
    text: string | null;
    sentAtMs: number;
    artId: string | null;

    constructor() {
        this.id = 0;
        this.userId = 0;
        this.name = null;
        this.text = null;
        this.sentAtMs = 0;
        this.artId = null;

    }

    static serialize(value: ChatMessageData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChatMessageData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(6);
        writer.writeUint32(value.id);
        writer.writeUint32(value.userId);
        writer.writeString(value.name);
        writer.writeString(value.text);
        writer.writeFloat64(value.sentAtMs);
        writer.writeString(value.artId);

    }

    static serializeArray(value: (ChatMessageData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChatMessageData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChatMessageData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChatMessageData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChatMessageData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChatMessageData();
        if (count == 6) {
            value.id = reader.readUint32();
            value.userId = reader.readUint32();
            value.name = reader.readString();
            value.text = reader.readString();
            value.sentAtMs = reader.readFloat64();
            value.artId = reader.readString();

        }
        else if (count > 6) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readUint32(); if (count == 1) return value;
            value.userId = reader.readUint32(); if (count == 2) return value;
            value.name = reader.readString(); if (count == 3) return value;
            value.text = reader.readString(); if (count == 4) return value;
            value.sentAtMs = reader.readFloat64(); if (count == 5) return value;
            value.artId = reader.readString(); if (count == 6) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChatMessageData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChatMessageData | null)[] | null {
        return reader.readArray(reader => ChatMessageData.deserializeCore(reader));
    }
}
