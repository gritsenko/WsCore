import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class GetRoomListRequest {
  constructor() {}

  static serialize(value: GetRoomListRequest | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: GetRoomListRequest | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(0);
  }

  static serializeArray(value: (GetRoomListRequest | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (GetRoomListRequest | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => GetRoomListRequest.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): GetRoomListRequest | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): GetRoomListRequest | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new GetRoomListRequest();
    if (count == 0) {
    } else if (count > 0) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (GetRoomListRequest | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (GetRoomListRequest | null)[] | null {
    return reader.readArray(reader => GetRoomListRequest.deserializeCore(reader));
  }
}
