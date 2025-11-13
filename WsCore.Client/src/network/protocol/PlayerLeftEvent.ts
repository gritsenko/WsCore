import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';

export class PlayerLeftEvent {
  clientId: number;

  constructor() {
    this.clientId = 0;
  }

  static serialize(value: PlayerLeftEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: PlayerLeftEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(1);
    writer.writeUint32(value.clientId);
  }

  static serializeArray(value: (PlayerLeftEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (PlayerLeftEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => PlayerLeftEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): PlayerLeftEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): PlayerLeftEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new PlayerLeftEvent();
    if (count == 1) {
      value.clientId = reader.readUint32();
    } else if (count > 1) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.clientId = reader.readUint32();
      if (count == 1) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (PlayerLeftEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (PlayerLeftEvent | null)[] | null {
    return reader.readArray(reader => PlayerLeftEvent.deserializeCore(reader));
  }
}
