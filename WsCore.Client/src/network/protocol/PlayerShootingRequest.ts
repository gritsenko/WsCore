import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class PlayerShootingRequest {
  weapon: number;

  constructor() {
    this.weapon = 0;
  }

  static serialize(value: PlayerShootingRequest | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: PlayerShootingRequest | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(1);
    writer.writeInt32(value.weapon);
  }

  static serializeArray(value: (PlayerShootingRequest | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (PlayerShootingRequest | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => PlayerShootingRequest.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): PlayerShootingRequest | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): PlayerShootingRequest | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new PlayerShootingRequest();
    if (count == 1) {
      value.weapon = reader.readInt32();
    } else if (count > 1) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.weapon = reader.readInt32();
      if (count == 1) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (PlayerShootingRequest | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (PlayerShootingRequest | null)[] | null {
    return reader.readArray(reader => PlayerShootingRequest.deserializeCore(reader));
  }
}
