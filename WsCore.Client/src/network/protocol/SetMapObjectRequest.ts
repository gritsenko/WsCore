import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class SetMapObjectRequest {
  mapX: number;
  mapY: number;
  objectType: number;

  constructor() {
    this.mapX = 0;
    this.mapY = 0;
    this.objectType = 0;
  }

  static serialize(value: SetMapObjectRequest | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: SetMapObjectRequest | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(3);
    writer.writeInt32(value.mapX);
    writer.writeInt32(value.mapY);
    writer.writeInt32(value.objectType);
  }

  static serializeArray(value: (SetMapObjectRequest | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (SetMapObjectRequest | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => SetMapObjectRequest.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): SetMapObjectRequest | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): SetMapObjectRequest | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new SetMapObjectRequest();
    if (count == 3) {
      value.mapX = reader.readInt32();
      value.mapY = reader.readInt32();
      value.objectType = reader.readInt32();
    } else if (count > 3) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.mapX = reader.readInt32();
      if (count == 1) return value;
      value.mapY = reader.readInt32();
      if (count == 2) return value;
      value.objectType = reader.readInt32();
      if (count == 3) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (SetMapObjectRequest | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (SetMapObjectRequest | null)[] | null {
    return reader.readArray(reader => SetMapObjectRequest.deserializeCore(reader));
  }
}
