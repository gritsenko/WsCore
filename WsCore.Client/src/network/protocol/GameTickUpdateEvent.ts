import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";
import { MovementStateData } from "./MovementStateData.js";
import { HitPlayerStateData } from "./HitPlayerStateData.js";

export class GameTickUpdateEvent {
    movementStates: (MovementStateData | null)[] | null;
    destroyedBulletsIds: number[] | null;
    respawnedPlayerIds: number[] | null;
    hitPlayersState: (HitPlayerStateData | null)[] | null;

    constructor() {
        this.movementStates = null;
        this.destroyedBulletsIds = null;
        this.respawnedPlayerIds = null;
        this.hitPlayersState = null;

    }

    static serialize(value: GameTickUpdateEvent | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: GameTickUpdateEvent | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(4);
        writer.writeArray(value.movementStates, (writer, x) => MovementStateData.serializeCore(writer, x));
        writer.writeArray(value.destroyedBulletsIds, (writer, x) => writer.writeUint32(x));
        writer.writeArray(value.respawnedPlayerIds, (writer, x) => writer.writeUint32(x));
        writer.writeArray(value.hitPlayersState, (writer, x) => HitPlayerStateData.serializeCore(writer, x));

    }

    static serializeArray(value: (GameTickUpdateEvent | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (GameTickUpdateEvent | null)[] | null): void {
        writer.writeArray(value, (writer, x) => GameTickUpdateEvent.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): GameTickUpdateEvent | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): GameTickUpdateEvent | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new GameTickUpdateEvent();
        if (count == 4) {
            value.movementStates = reader.readArray(reader => MovementStateData.deserializeCore(reader));
            value.destroyedBulletsIds = reader.readArray(reader => reader.readUint32());
            value.respawnedPlayerIds = reader.readArray(reader => reader.readUint32());
            value.hitPlayersState = reader.readArray(reader => HitPlayerStateData.deserializeCore(reader));

        }
        else if (count > 4) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.movementStates = reader.readArray(reader => MovementStateData.deserializeCore(reader)); if (count == 1) return value;
            value.destroyedBulletsIds = reader.readArray(reader => reader.readUint32()); if (count == 2) return value;
            value.respawnedPlayerIds = reader.readArray(reader => reader.readUint32()); if (count == 3) return value;
            value.hitPlayersState = reader.readArray(reader => HitPlayerStateData.deserializeCore(reader)); if (count == 4) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (GameTickUpdateEvent | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (GameTickUpdateEvent | null)[] | null {
        return reader.readArray(reader => GameTickUpdateEvent.deserializeCore(reader));
    }
}
