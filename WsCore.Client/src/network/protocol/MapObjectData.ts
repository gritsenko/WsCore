import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class MapObjectData {
    objectId: number;
    x: number;
    y: number;
    objectType: number;

    constructor() {
        this.objectId = 0;
        this.x = 0;
        this.y = 0;
        this.objectType = 0;

    }

    static serialize(value: MapObjectData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: MapObjectData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint32(value.objectId);
        writer.writeFloat32(value.x);
        writer.writeFloat32(value.y);
        writer.writeUint32(value.objectType);

    }

    static serializeArray(value: (MapObjectData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (MapObjectData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => MapObjectData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): MapObjectData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): MapObjectData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new MapObjectData();
        if (count == 4) {
            value.objectId = reader.readUint32();
            value.x = reader.readFloat32();
            value.y = reader.readFloat32();
            value.objectType = reader.readUint32();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.objectId = reader.readUint32(); if (count == 1) return value;
            value.x = reader.readFloat32(); if (count == 2) return value;
            value.y = reader.readFloat32(); if (count == 3) return value;
            value.objectType = reader.readUint32(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (MapObjectData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (MapObjectData | null)[] | null {
        return reader.readArray(reader => MapObjectData.deserializeCore(reader));
    }
}
