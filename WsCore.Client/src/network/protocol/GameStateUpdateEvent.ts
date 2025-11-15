import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';
import { PlayerStateData } from './PlayerStateData.js';

export class GameStateUpdateEvent {
  playerStateData: (PlayerStateData | null)[] | null;

  constructor() {
    this.playerStateData = null;
  }

  static serialize(value: GameStateUpdateEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: GameStateUpdateEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(1);
    writer.writeArray(value.playerStateData, (writer, x) =>
      PlayerStateData.serializeCore(writer, x)
    );
  }

  static serializeArray(value: (GameStateUpdateEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (GameStateUpdateEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => GameStateUpdateEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): GameStateUpdateEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): GameStateUpdateEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new GameStateUpdateEvent();
    if (count == 1) {
      value.playerStateData = reader.readArray(reader => PlayerStateData.deserializeCore(reader));
    } else if (count > 1) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.playerStateData = reader.readArray(reader => PlayerStateData.deserializeCore(reader));
      if (count == 1) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (GameStateUpdateEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (GameStateUpdateEvent | null)[] | null {
    return reader.readArray(reader => GameStateUpdateEvent.deserializeCore(reader));
  }
}
