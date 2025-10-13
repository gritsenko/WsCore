import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { MovementStateData } from "./MovementStateData.js";

export class PlayerStateData {
    id: number;
    name: string | null;
    hp: number;
    maxHp: number;
    bodyIndex: number;
    weaponIndex: number;
    armorIndex: number;
    movementState: MovementStateData | null;

    constructor() {
        this.id = 0;
        this.name = null;
        this.hp = 0;
        this.maxHp = 0;
        this.bodyIndex = 0;
        this.weaponIndex = 0;
        this.armorIndex = 0;
        this.movementState = null;

    }

    static serialize(value: PlayerStateData | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: PlayerStateData | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(8);
        writer.writeUint32(value.id);
        writer.writeString(value.name);
        writer.writeUint8(value.hp);
        writer.writeUint8(value.maxHp);
        writer.writeInt32(value.bodyIndex);
        writer.writeInt32(value.weaponIndex);
        writer.writeInt32(value.armorIndex);
        MovementStateData.serializeCore(writer, value.movementState);

    }

    static serializeArray(value: (PlayerStateData | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (PlayerStateData | null)[] | null): void {
        writer.writeArray(value, (writer, x) => PlayerStateData.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): PlayerStateData | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): PlayerStateData | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new PlayerStateData();
        if (count == 8) {
            value.id = reader.readUint32();
            value.name = reader.readString();
            value.hp = reader.readUint8();
            value.maxHp = reader.readUint8();
            value.bodyIndex = reader.readInt32();
            value.weaponIndex = reader.readInt32();
            value.armorIndex = reader.readInt32();
            value.movementState = MovementStateData.deserializeCore(reader);

        }
        else if (count > 8) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.id = reader.readUint32(); if (count == 1) return value;
            value.name = reader.readString(); if (count == 2) return value;
            value.hp = reader.readUint8(); if (count == 3) return value;
            value.maxHp = reader.readUint8(); if (count == 4) return value;
            value.bodyIndex = reader.readInt32(); if (count == 5) return value;
            value.weaponIndex = reader.readInt32(); if (count == 6) return value;
            value.armorIndex = reader.readInt32(); if (count == 7) return value;
            value.movementState = MovementStateData.deserializeCore(reader); if (count == 8) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (PlayerStateData | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (PlayerStateData | null)[] | null {
        return reader.readArray(reader => PlayerStateData.deserializeCore(reader));
    }
}
