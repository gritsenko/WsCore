import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class MovementStateData {
    playerId: number;
    x: number;
    y: number;
    animationState: number;

    constructor() {
        this.playerId = 0;
        this.x = 0;
        this.y = 0;
        this.animationState = 0;

    }

    static serialize(value: MovementStateData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: MovementStateData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeUint32(value.playerId);
        writer.writeFloat32(value.x);
        writer.writeFloat32(value.y);
        writer.writeUint8(value.animationState);

    }

    static serializeArray(value: (MovementStateData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (MovementStateData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => MovementStateData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): MovementStateData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): MovementStateData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new MovementStateData();
        if (count == 4) {
            value.playerId = reader.readUint32();
            value.x = reader.readFloat32();
            value.y = reader.readFloat32();
            value.animationState = reader.readUint8();

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.playerId = reader.readUint32(); if (count == 1) return value;
            value.x = reader.readFloat32(); if (count == 2) return value;
            value.y = reader.readFloat32(); if (count == 3) return value;
            value.animationState = reader.readUint8(); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (MovementStateData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (MovementStateData | null)[] | null {
        return reader.readArray(reader => MovementStateData.deserializeCore(reader));
    }
}
