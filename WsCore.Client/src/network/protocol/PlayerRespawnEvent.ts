import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';
import { PlayerStateData } from './PlayerStateData.js';

export class PlayerRespawnEvent {
  playerStateData: PlayerStateData | null;

  constructor() {
    this.playerStateData = null;
  }

  static serialize(value: PlayerRespawnEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: PlayerRespawnEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(1);
    PlayerStateData.serializeCore(writer, value.playerStateData);
  }

  static serializeArray(value: (PlayerRespawnEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (PlayerRespawnEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => PlayerRespawnEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): PlayerRespawnEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): PlayerRespawnEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new PlayerRespawnEvent();
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

  static deserializeArray(buffer: ArrayBuffer): (PlayerRespawnEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (PlayerRespawnEvent | null)[] | null {
    return reader.readArray(reader => PlayerRespawnEvent.deserializeCore(reader));
  }
}
