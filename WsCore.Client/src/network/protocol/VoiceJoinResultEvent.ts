import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { VoiceIceServer } from "./VoiceIceServer.js";

export class VoiceJoinResultEvent {
    roomId: string | null;
    success: boolean;
    error: string | null;
    peers: number[] | null;
    iceServers: (VoiceIceServer | null)[] | null;

    constructor() {
        this.roomId = null;
        this.success = false;
        this.error = null;
        this.peers = null;
        this.iceServers = null;

    }

    static serialize(value: VoiceJoinResultEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceJoinResultEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(5);
        writer.writeString(value.roomId);
        writer.writeBoolean(value.success);
        writer.writeString(value.error);
        writer.writeArray(value.peers, (writer, x) => writer.writeUint32(x));
        writer.writeArray(value.iceServers, (writer, x) => VoiceIceServer.serializeCore(writer, x));

    }

    static serializeArray(value: (VoiceJoinResultEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceJoinResultEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceJoinResultEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceJoinResultEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceJoinResultEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceJoinResultEvent();
        if (count == 5) {
            value.roomId = reader.readString();
            value.success = reader.readBoolean();
            value.error = reader.readString();
            value.peers = reader.readArray(reader => reader.readUint32());
            value.iceServers = reader.readArray(reader => VoiceIceServer.deserializeCore(reader));

        }
        else if (count > 5) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.roomId = reader.readString(); if (count == 1) return value;
            value.success = reader.readBoolean(); if (count == 2) return value;
            value.error = reader.readString(); if (count == 3) return value;
            value.peers = reader.readArray(reader => reader.readUint32()); if (count == 4) return value;
            value.iceServers = reader.readArray(reader => VoiceIceServer.deserializeCore(reader)); if (count == 5) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceJoinResultEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceJoinResultEvent | null)[] | null {
        return reader.readArray(reader => VoiceJoinResultEvent.deserializeCore(reader));
    }
}
