import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class MovementStateData {
    playerId: number;
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    targetX: number;
    targetY: number;
    bodyAngle: number;
    controlsState: number;
    velocityX: number;
    velocityY: number;
    animationState: number;

    constructor() {
        this.playerId = 0;
        this.x = 0;
        this.y = 0;
        this.aimX = 0;
        this.aimY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.bodyAngle = 0;
        this.controlsState = 0;
        this.velocityX = 0;
        this.velocityY = 0;
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

        writer.writeObjectHeader(12);
        writer.writeUint32(value.playerId);
        writer.writeFloat32(value.x);
        writer.writeFloat32(value.y);
        writer.writeFloat32(value.aimX);
        writer.writeFloat32(value.aimY);
        writer.writeFloat32(value.targetX);
        writer.writeFloat32(value.targetY);
        writer.writeInt32(value.bodyAngle);
        writer.writeInt32(value.controlsState);
        writer.writeFloat32(value.velocityX);
        writer.writeFloat32(value.velocityY);
        writer.writeInt32(value.animationState);

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
        if (count == 12) {
            value.playerId = reader.readUint32();
            value.x = reader.readFloat32();
            value.y = reader.readFloat32();
            value.aimX = reader.readFloat32();
            value.aimY = reader.readFloat32();
            value.targetX = reader.readFloat32();
            value.targetY = reader.readFloat32();
            value.bodyAngle = reader.readInt32();
            value.controlsState = reader.readInt32();
            value.velocityX = reader.readFloat32();
            value.velocityY = reader.readFloat32();
            value.animationState = reader.readInt32();

        }
        else if (count > 12) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.playerId = reader.readUint32(); if (count == 1) return value;
            value.x = reader.readFloat32(); if (count == 2) return value;
            value.y = reader.readFloat32(); if (count == 3) return value;
            value.aimX = reader.readFloat32(); if (count == 4) return value;
            value.aimY = reader.readFloat32(); if (count == 5) return value;
            value.targetX = reader.readFloat32(); if (count == 6) return value;
            value.targetY = reader.readFloat32(); if (count == 7) return value;
            value.bodyAngle = reader.readInt32(); if (count == 8) return value;
            value.controlsState = reader.readInt32(); if (count == 9) return value;
            value.velocityX = reader.readFloat32(); if (count == 10) return value;
            value.velocityY = reader.readFloat32(); if (count == 11) return value;
            value.animationState = reader.readInt32(); if (count == 12) return value;

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
