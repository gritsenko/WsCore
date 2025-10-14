import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class UpdatePlayerSlotsEvent {
  playerId: number;
  body: number;
  gun: number;
  armor: number;

  constructor() {
    this.playerId = 0;
    this.body = 0;
    this.gun = 0;
    this.armor = 0;
  }

  static serialize(value: UpdatePlayerSlotsEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: UpdatePlayerSlotsEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(4);
    writer.writeUint32(value.playerId);
    writer.writeInt32(value.body);
    writer.writeInt32(value.gun);
    writer.writeInt32(value.armor);
  }

  static serializeArray(value: (UpdatePlayerSlotsEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (UpdatePlayerSlotsEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => UpdatePlayerSlotsEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): UpdatePlayerSlotsEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): UpdatePlayerSlotsEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new UpdatePlayerSlotsEvent();
    if (count == 4) {
      value.playerId = reader.readUint32();
      value.body = reader.readInt32();
      value.gun = reader.readInt32();
      value.armor = reader.readInt32();
    } else if (count > 4) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.playerId = reader.readUint32();
      if (count == 1) return value;
      value.body = reader.readInt32();
      if (count == 2) return value;
      value.gun = reader.readInt32();
      if (count == 3) return value;
      value.armor = reader.readInt32();
      if (count == 4) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (UpdatePlayerSlotsEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (UpdatePlayerSlotsEvent | null)[] | null {
    return reader.readArray(reader => UpdatePlayerSlotsEvent.deserializeCore(reader));
  }
}
