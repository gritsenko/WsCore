import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class HitPlayerStateData {
    playerId: number;
    hitterId: number;
    newHp: number;

    constructor() {
        this.playerId = 0;
        this.hitterId = 0;
        this.newHp = 0;

    }

    static serialize(value: HitPlayerStateData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: HitPlayerStateData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeUint32(value.playerId);
        writer.writeUint32(value.hitterId);
        writer.writeInt32(value.newHp);

    }

    static serializeArray(value: (HitPlayerStateData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (HitPlayerStateData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => HitPlayerStateData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): HitPlayerStateData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): HitPlayerStateData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new HitPlayerStateData();
        if (count == 3) {
            value.playerId = reader.readUint32();
            value.hitterId = reader.readUint32();
            value.newHp = reader.readInt32();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.playerId = reader.readUint32(); if (count == 1) return value;
            value.hitterId = reader.readUint32(); if (count == 2) return value;
            value.newHp = reader.readInt32(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (HitPlayerStateData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (HitPlayerStateData | null)[] | null {
        return reader.readArray(reader => HitPlayerStateData.deserializeCore(reader));
    }
}
