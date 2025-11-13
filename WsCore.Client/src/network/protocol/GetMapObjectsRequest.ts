import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class GetMapObjectsRequest {
    mapX: number;
    mapY: number;

    constructor() {
        this.mapX = 0;
        this.mapY = 0;

    }

    static serialize(value: GetMapObjectsRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GetMapObjectsRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(2);
        writer.writeInt32(value.mapX);
        writer.writeInt32(value.mapY);

    }

    static serializeArray(value: (GetMapObjectsRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GetMapObjectsRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GetMapObjectsRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GetMapObjectsRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GetMapObjectsRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GetMapObjectsRequest();
        if (count == 2) {
            value.mapX = reader.readInt32();
            value.mapY = reader.readInt32();

        }
        else if (count > 2) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.mapX = reader.readInt32(); if (count == 1) return value;
            value.mapY = reader.readInt32(); if (count == 2) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GetMapObjectsRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GetMapObjectsRequest | null)[] | null {
        return reader.readArray(reader => GetMapObjectsRequest.deserializeCore(reader));
    }
}
