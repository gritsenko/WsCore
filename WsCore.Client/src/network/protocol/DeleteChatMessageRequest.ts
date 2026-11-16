import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class DeleteChatMessageRequest {
    roomId: string | null;
    messageId: number;

    constructor() {
        this.roomId = null;
        this.messageId = 0;

    }

    static serialize(value: DeleteChatMessageRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: DeleteChatMessageRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeString(value.roomId);
        writer.writeUint32(value.messageId);

    }

    static serializeArray(value: (DeleteChatMessageRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (DeleteChatMessageRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => DeleteChatMessageRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): DeleteChatMessageRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): DeleteChatMessageRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new DeleteChatMessageRequest();
        if (count == 2) {
            value.roomId = reader.readString();
            value.messageId = reader.readUint32();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.messageId = reader.readUint32(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (DeleteChatMessageRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (DeleteChatMessageRequest | null)[] | null {
        return reader.readArray(reader => DeleteChatMessageRequest.deserializeCore(reader));
    }
}
