import { MemoryPackWriter } from "./MemoryPackWriter.js";
import { MemoryPackReader } from "./MemoryPackReader.js";

export class ListApiTokensRequest {

    constructor() {

    }

    static serialize(value: ListApiTokensRequest | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeCore(writer, value);
        return writer.toArray();
    }

    static serializeCore(writer: MemoryPackWriter, value: ListApiTokensRequest | null): void {
        if (value == null) {
            writer.writeNullObjectHeader();
            return;
        }

        writer.writeObjectHeader(0);

    }

    static serializeArray(value: (ListApiTokensRequest | null)[] | null): Uint8Array {
        const writer = MemoryPackWriter.getSharedInstance();
        this.serializeArrayCore(writer, value);
        return writer.toArray();
    }

    static serializeArrayCore(writer: MemoryPackWriter, value: (ListApiTokensRequest | null)[] | null): void {
        writer.writeArray(value, (writer, x) => ListApiTokensRequest.serializeCore(writer, x));
    }

    static deserialize(buffer: ArrayBuffer): ListApiTokensRequest | null {
        return this.deserializeCore(new MemoryPackReader(buffer));
    }

    static deserializeCore(reader: MemoryPackReader): ListApiTokensRequest | null {
        const [ok, count] = reader.tryReadObjectHeader();
        if (!ok) {
            return null;
        }

        const value = new ListApiTokensRequest();
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

    static deserializeArray(buffer: ArrayBuffer): (ListApiTokensRequest | null)[] | null {
        return this.deserializeArrayCore(new MemoryPackReader(buffer));
    }

    static deserializeArrayCore(reader: MemoryPackReader): (ListApiTokensRequest | null)[] | null {
        return reader.readArray(reader => ListApiTokensRequest.deserializeCore(reader));
    }
}
