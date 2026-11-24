import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class SetLeaderboardHiddenRequest {
    requestId: number;
    hidden: boolean;

    constructor() {
        this.requestId = 0;
        this.hidden = false;

    }

    static serialize(value: SetLeaderboardHiddenRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: SetLeaderboardHiddenRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeUint32(value.requestId);
        writer.writeBoolean(value.hidden);

    }

    static serializeArray(value: (SetLeaderboardHiddenRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (SetLeaderboardHiddenRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => SetLeaderboardHiddenRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): SetLeaderboardHiddenRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): SetLeaderboardHiddenRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new SetLeaderboardHiddenRequest();
        if (count == 2) {
            value.requestId = reader.readUint32();
            value.hidden = reader.readBoolean();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.requestId = reader.readUint32(); if (count == 1) return value;
            value.hidden = reader.readBoolean(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (SetLeaderboardHiddenRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (SetLeaderboardHiddenRequest | null)[] | null {
        return reader.readArray(reader => SetLeaderboardHiddenRequest.deserializeCore(reader));
    }
}
