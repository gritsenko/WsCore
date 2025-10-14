import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class UpdatePlayerTargetRequest {
  aimX: number;
  aimY: number;

  constructor() {
    this.aimX = 0;
    this.aimY = 0;
  }

  static serialize(value: UpdatePlayerTargetRequest | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: UpdatePlayerTargetRequest | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(2);
    writer.writeFloat32(value.aimX);
    writer.writeFloat32(value.aimY);
  }

  static serializeArray(value: (UpdatePlayerTargetRequest | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (UpdatePlayerTargetRequest | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => UpdatePlayerTargetRequest.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): UpdatePlayerTargetRequest | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): UpdatePlayerTargetRequest | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new UpdatePlayerTargetRequest();
    if (count == 2) {
      value.aimX = reader.readFloat32();
      value.aimY = reader.readFloat32();
    } else if (count > 2) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.aimX = reader.readFloat32();
      if (count == 1) return value;
      value.aimY = reader.readFloat32();
      if (count == 2) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (UpdatePlayerTargetRequest | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(
    reader: MemoryPackReader
  ): (UpdatePlayerTargetRequest | null)[] | null {
    return reader.readArray(reader => UpdatePlayerTargetRequest.deserializeCore(reader));
  }
}
