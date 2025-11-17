import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { MapObjectData } from "./MapObjectData.js";

export class UpdateMapObjectsEvent {
    mapObjects: (MapObjectData | null)[] | null;

    constructor() {
        this.mapObjects = null;

    }

    static serialize(value: UpdateMapObjectsEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: UpdateMapObjectsEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(1);
        writer.writeArray(value.mapObjects, (writer, x) => MapObjectData.serializeCore(writer, x));

    }

    static serializeArray(value: (UpdateMapObjectsEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (UpdateMapObjectsEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => UpdateMapObjectsEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): UpdateMapObjectsEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): UpdateMapObjectsEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new UpdateMapObjectsEvent();
        if (count == 1) {
            value.mapObjects = reader.readArray(reader => MapObjectData.deserializeCore(reader));

        }
        else if (count > 1) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.mapObjects = reader.readArray(reader => MapObjectData.deserializeCore(reader)); if (count == 1) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (UpdateMapObjectsEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (UpdateMapObjectsEvent | null)[] | null {
        return reader.readArray(reader => UpdateMapObjectsEvent.deserializeCore(reader));
    }
}
