import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class DestroyedBulletsStateData {
    bulletIds: number[] | null;

    constructor() {
        this.bulletIds = null;

    }

    static serialize(value: DestroyedBulletsStateData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: DestroyedBulletsStateData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeArray(value.bulletIds, (writer, x) => writer.writeUint32(x));

    }

    static serializeArray(value: (DestroyedBulletsStateData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (DestroyedBulletsStateData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => DestroyedBulletsStateData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): DestroyedBulletsStateData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): DestroyedBulletsStateData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new DestroyedBulletsStateData();
        if (count == 1) {
            value.bulletIds = reader.readArray(reader => reader.readUint32());

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.bulletIds = reader.readArray(reader => reader.readUint32()); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (DestroyedBulletsStateData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (DestroyedBulletsStateData | null)[] | null {
        return reader.readArray(reader => DestroyedBulletsStateData.deserializeCore(reader));
    }
}
