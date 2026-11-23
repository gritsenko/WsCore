import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class VoiceLeaveRequest {

    constructor() {

    }

    static serialize(value: VoiceLeaveRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: VoiceLeaveRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(0);

    }

    static serializeArray(value: (VoiceLeaveRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (VoiceLeaveRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => VoiceLeaveRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): VoiceLeaveRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): VoiceLeaveRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new VoiceLeaveRequest();
        if (count == 0) {

        }
        else if (count > 0) {
            throw new Error("Current object's property count is larger than type schema, can't deserialize about versioning.");
        }
        else {
            if (count == 0) return value;

        }
        return value;
    }

    static deserializeArray(buffer: ArrayBuffer): (VoiceLeaveRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (VoiceLeaveRequest | null)[] | null {
        return reader.readArray(reader => VoiceLeaveRequest.deserializeCore(reader));
    }
}
