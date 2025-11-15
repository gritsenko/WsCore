import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class SetPlayerHpEvent {
  playerId: number;
  playerHp: number;

  constructor() {
    this.playerId = 0;
    this.playerHp = 0;
  }

  static serialize(value: SetPlayerHpEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: SetPlayerHpEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(2);
    writer.writeUint32(value.playerId);
    writer.writeUint8(value.playerHp);
  }

  static serializeArray(value: (SetPlayerHpEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (SetPlayerHpEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => SetPlayerHpEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): SetPlayerHpEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): SetPlayerHpEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new SetPlayerHpEvent();
    if (count == 2) {
      value.playerId = reader.readUint32();
      value.playerHp = reader.readUint8();
    } else if (count > 2) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.playerId = reader.readUint32();
      if (count == 1) return value;
      value.playerHp = reader.readUint8();
      if (count == 2) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (SetPlayerHpEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (SetPlayerHpEvent | null)[] | null {
    return reader.readArray(reader => SetPlayerHpEvent.deserializeCore(reader));
  }
}
