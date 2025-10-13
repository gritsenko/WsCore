import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class UpdatePlayerSlotsRequest {
    body: number;
    gun: number;
    armor: number;

    constructor() {
        this.body = 0;
        this.gun = 0;
        this.armor = 0;

    }

    static serialize(value: UpdatePlayerSlotsRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: UpdatePlayerSlotsRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeInt32(value.body);
        writer.writeInt32(value.gun);
        writer.writeInt32(value.armor);

    }

    static serializeArray(value: (UpdatePlayerSlotsRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (UpdatePlayerSlotsRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => UpdatePlayerSlotsRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): UpdatePlayerSlotsRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): UpdatePlayerSlotsRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new UpdatePlayerSlotsRequest();
        if (count == 3) {
            value.body = reader.readInt32();
            value.gun = reader.readInt32();
            value.armor = reader.readInt32();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.body = reader.readInt32(); if (count == 1) return value;
            value.gun = reader.readInt32(); if (count == 2) return value;
            value.armor = reader.readInt32(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (UpdatePlayerSlotsRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (UpdatePlayerSlotsRequest | null)[] | null {
        return reader.readArray(reader => UpdatePlayerSlotsRequest.deserializeCore(reader));
    }
}
