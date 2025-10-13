import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class PlayerRespawnRequest {
    playerId: number;

    constructor() {
        this.playerId = 0;

    }

    static serialize(value: PlayerRespawnRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PlayerRespawnRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeUint32(value.playerId);

    }

    static serializeArray(value: (PlayerRespawnRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PlayerRespawnRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PlayerRespawnRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PlayerRespawnRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PlayerRespawnRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PlayerRespawnRequest();
        if (count == 1) {
            value.playerId = reader.readUint32();

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.playerId = reader.readUint32(); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PlayerRespawnRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PlayerRespawnRequest | null)[] | null {
        return reader.readArray(reader => PlayerRespawnRequest.deserializeCore(reader));
    }
}
