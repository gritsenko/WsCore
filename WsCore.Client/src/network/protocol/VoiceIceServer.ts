import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceIceServer {
    urls: (string | null)[] | null;
    username: string | null;
    credential: string | null;

    constructor() {
        this.urls = null;
        this.username = null;
        this.credential = null;

    }

    static serialize(value: VoiceIceServer | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceIceServer | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeArray(value.urls, (writer, x) => writer.writeString(x));
        writer.writeString(value.username);
        writer.writeString(value.credential);

    }

    static serializeArray(value: (VoiceIceServer | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceIceServer | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceIceServer.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceIceServer | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceIceServer | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceIceServer();
        if (count == 3) {
            value.urls = reader.readArray(reader => reader.readString());
            value.username = reader.readString();
            value.credential = reader.readString();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.urls = reader.readArray(reader => reader.readString()); if (count == 1) return value;
            value.username = reader.readString(); if (count == 2) return value;
            value.credential = reader.readString(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceIceServer | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceIceServer | null)[] | null {
        return reader.readArray(reader => VoiceIceServer.deserializeCore(reader));
    }
}
