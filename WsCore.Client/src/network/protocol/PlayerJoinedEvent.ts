import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';
import { PlayerStateData } from './PlayerStateData.js';

export class PlayerJoinedEvent {
  playerStateData: PlayerStateData | null;

  constructor() {
    this.playerStateData = null;
  }

  static serialize(value: PlayerJoinedEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: PlayerJoinedEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(1);
    PlayerStateData.serializeCore(writer, value.playerStateData);
  }

  static serializeArray(value: (PlayerJoinedEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (PlayerJoinedEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => PlayerJoinedEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): PlayerJoinedEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): PlayerJoinedEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new PlayerJoinedEvent();
    if (count == 1) {
      value.playerStateData = PlayerStateData.deserializeCore(reader);
    } else if (count > 1) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.playerStateData = PlayerStateData.deserializeCore(reader);
      if (count == 1) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (PlayerJoinedEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (PlayerJoinedEvent | null)[] | null {
    return reader.readArray(reader => PlayerJoinedEvent.deserializeCore(reader));
  }
}
