import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChatHistoryRequest {
    beforeId: number;
    afterId: number;
    epoch: number;

    constructor() {
        this.beforeId = 0;
        this.afterId = 0;
        this.epoch = 0;

    }

    static serialize(value: ChatHistoryRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChatHistoryRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeUint32(value.beforeId);
        writer.writeUint32(value.afterId);
        writer.writeUint32(value.epoch);

    }

    static serializeArray(value: (ChatHistoryRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChatHistoryRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChatHistoryRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChatHistoryRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChatHistoryRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChatHistoryRequest();
        if (count == 3) {
            value.beforeId = reader.readUint32();
            value.afterId = reader.readUint32();
            value.epoch = reader.readUint32();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.beforeId = reader.readUint32(); if (count == 1) return value;
            value.afterId = reader.readUint32(); if (count == 2) return value;
            value.epoch = reader.readUint32(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChatHistoryRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChatHistoryRequest | null)[] | null {
        return reader.readArray(reader => ChatHistoryRequest.deserializeCore(reader));
    }
}
