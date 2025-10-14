import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class PlayerShootingEvent {
  clientId: number;
  weapon: number;
  bulletIds: number[] | null;

  constructor() {
    this.clientId = 0;
    this.weapon = 0;
    this.bulletIds = null;
  }

  static serialize(value: PlayerShootingEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: PlayerShootingEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(3);
    writer.writeUint32(value.clientId);
    writer.writeInt32(value.weapon);
    writer.writeArray(value.bulletIds, (writer, x) => writer.writeUint32(x));
  }

  static serializeArray(value: (PlayerShootingEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (PlayerShootingEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => PlayerShootingEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): PlayerShootingEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): PlayerShootingEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new PlayerShootingEvent();
    if (count == 3) {
      value.clientId = reader.readUint32();
      value.weapon = reader.readInt32();
      value.bulletIds = reader.readArray(reader => reader.readUint32());
    } else if (count > 3) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.clientId = reader.readUint32();
      if (count == 1) return value;
      value.weapon = reader.readInt32();
      if (count == 2) return value;
      value.bulletIds = reader.readArray(reader => reader.readUint32());
      if (count == 3) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (PlayerShootingEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (PlayerShootingEvent | null)[] | null {
    return reader.readArray(reader => PlayerShootingEvent.deserializeCore(reader));
  }
}
