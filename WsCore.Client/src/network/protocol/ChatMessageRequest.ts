import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ChatMessageRequest {
    message: string | null;
    artId: string | null;

    constructor() {
        this.message = null;
        this.artId = null;

    }

    static serialize(value: ChatMessageRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ChatMessageRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.message);
        writer.writeString(value.artId);

    }

    static serializeArray(value: (ChatMessageRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ChatMessageRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ChatMessageRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ChatMessageRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ChatMessageRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ChatMessageRequest();
        if (count == 2) {
            value.message = reader.readString();
            value.artId = reader.readString();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.message = reader.readString(); if (count == 1) return value;
            value.artId = reader.readString(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (ChatMessageRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ChatMessageRequest | null)[] | null {
        return reader.readArray(reader => ChatMessageRequest.deserializeCore(reader));
    }
}
