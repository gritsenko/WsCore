import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class LeaderboardResultEvent {
    requestId: number;
    ok: boolean;
    status: number;
    error: string | null;
    resultJson: string | null;

    constructor() {
        this.requestId = 0;
        this.ok = false;
        this.status = 0;
        this.error = null;
        this.resultJson = null;

    }

    static serialize(value: LeaderboardResultEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: LeaderboardResultEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(5);
        writer.writeUint32(value.requestId);
        writer.writeBoolean(value.ok);
        writer.writeInt32(value.status);
        writer.writeString(value.error);
        writer.writeString(value.resultJson);

    }

    static serializeArray(value: (LeaderboardResultEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (LeaderboardResultEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => LeaderboardResultEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): LeaderboardResultEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): LeaderboardResultEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new LeaderboardResultEvent();
        if (count == 5) {
            value.requestId = reader.readUint32();
            value.ok = reader.readBoolean();
            value.status = reader.readInt32();
            value.error = reader.readString();
            value.resultJson = reader.readString();

        }
        else if (count > 5) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.requestId = reader.readUint32(); if (count == 1) return value;
            value.ok = reader.readBoolean(); if (count == 2) return value;
            value.status = reader.readInt32(); if (count == 3) return value;
            value.error = reader.readString(); if (count == 4) return value;
            value.resultJson = reader.readString(); if (count == 5) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (LeaderboardResultEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (LeaderboardResultEvent | null)[] | null {
        return reader.readArray(reader => LeaderboardResultEvent.deserializeCore(reader));
    }
}
