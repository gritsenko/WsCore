import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class UpdatePlayerStateRequest {
    aimX: number;
    aimY: number;
    controlsState: number;

    constructor() {
        this.aimX = 0;
        this.aimY = 0;
        this.controlsState = 0;

    }

    static serialize(value: UpdatePlayerStateRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: UpdatePlayerStateRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(3);
        writer.writeFloat32(value.aimX);
        writer.writeFloat32(value.aimY);
        writer.writeInt32(value.controlsState);

    }

    static serializeArray(value: (UpdatePlayerStateRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (UpdatePlayerStateRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => UpdatePlayerStateRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): UpdatePlayerStateRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): UpdatePlayerStateRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new UpdatePlayerStateRequest();
        if (count == 3) {
            value.aimX = reader.readFloat32();
            value.aimY = reader.readFloat32();
            value.controlsState = reader.readInt32();

        }
        else if (count > 3) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;
            value.aimX = reader.readFloat32(); if (count == 1) return value;
            value.aimY = reader.readFloat32(); if (count == 2) return value;
            value.controlsState = reader.readInt32(); if (count == 3) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (UpdatePlayerStateRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (UpdatePlayerStateRequest | null)[] | null {
        return reader.readArray(reader => UpdatePlayerStateRequest.deserializeCore(reader));
    }
}
