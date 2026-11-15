import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { ChatMessageData } from "./ChatMessageData.js";

export class ChatHistoryEvent {
    roomId: string | null;
    epoch: number;
    beforeId: number;
    reset: boolean;
    hasMore: boolean;
    messages: (ChatMessageData | null)[] | null;

    constructor() {
        this.roomId = null;
        this.epoch = 0;
        this.beforeId = 0;
        this.reset = false;
        this.hasMore = false;
        this.messages = null;

    }

    static serialize(value: ChatHistoryEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChatHistoryEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(6);
        writer.writeString(value.roomId);
        writer.writeUint32(value.epoch);
        writer.writeUint32(value.beforeId);
        writer.writeBoolean(value.reset);
        writer.writeBoolean(value.hasMore);
        writer.writeArray(value.messages, (writer, x) => ChatMessageData.serializeCore(writer, x));

    }

    static serializeArray(value: (ChatHistoryEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChatHistoryEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChatHistoryEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChatHistoryEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChatHistoryEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChatHistoryEvent();
        if (count == 6) {
            value.roomId = reader.readString();
            value.epoch = reader.readUint32();
            value.beforeId = reader.readUint32();
            value.reset = reader.readBoolean();
            value.hasMore = reader.readBoolean();
            value.messages = reader.readArray(reader => ChatMessageData.deserializeCore(reader));

        }
        else if (count > 6) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.epoch = reader.readUint32(); if (count == 2) return value;
            value.beforeId = reader.readUint32(); if (count == 3) return value;
            value.reset = reader.readBoolean(); if (count == 4) return value;
            value.hasMore = reader.readBoolean(); if (count == 5) return value;
            value.messages = reader.readArray(reader => ChatMessageData.deserializeCore(reader)); if (count == 6) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChatHistoryEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChatHistoryEvent | null)[] | null {
        return reader.readArray(reader => ChatHistoryEvent.deserializeCore(reader));
    }
}
