import { MemoryPackWriter } from './MemoryPackWriter.js';
import { MemoryPackReader } from './MemoryPackReader.js';
import { RoomUserInfo } from './RoomUserInfo.js';

export class RoomUsersUpdateEvent {
  eventType: string | null;
  roomId: string | null;
  users: (RoomUserInfo | null)[] | null;

  constructor() {
    this.eventType = null;
    this.roomId = null;
    this.users = null;
  }

  static serialize(value: RoomUsersUpdateEvent | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeCore(writer, value);
    return writer.toArray();
  }

  static serializeCore(writer: MemoryPackWriter, value: RoomUsersUpdateEvent | null): void {
    if (value == null) {
      writer.writeNullObjectHeader();
      return;
    }

    writer.writeObjectHeader(3);
    writer.writeString(value.eventType);
    writer.writeString(value.roomId);
    writer.writeArray(value.users, (writer, x) => RoomUserInfo.serializeCore(writer, x));
  }

  static serializeArray(value: (RoomUsersUpdateEvent | null)[] | null): Uint8Array {
    const writer = MemoryPackWriter.getSharedInstance();
    this.serializeArrayCore(writer, value);
    return writer.toArray();
  }

  static serializeArrayCore(
    writer: MemoryPackWriter,
    value: (RoomUsersUpdateEvent | null)[] | null
  ): void {
    writer.writeArray(value, (writer, x) => RoomUsersUpdateEvent.serializeCore(writer, x));
  }

  static deserialize(buffer: ArrayBuffer): RoomUsersUpdateEvent | null {
    return this.deserializeCore(new MemoryPackReader(buffer));
  }

  static deserializeCore(reader: MemoryPackReader): RoomUsersUpdateEvent | null {
    const [ok, count] = reader.tryReadObjectHeader();
    if (!ok) {
      return null;
    }

    const value = new RoomUsersUpdateEvent();
    if (count == 3) {
      value.eventType = reader.readString();
      value.roomId = reader.readString();
      value.users = reader.readArray(reader => RoomUserInfo.deserializeCore(reader));
    } else if (count > 3) {
      throw new Error(
        "Current object's property count is larger than type schema, can't deserialize about versioning."
      );
    } else {
      if (count == 0) return value;
      value.eventType = reader.readString();
      if (count == 1) return value;
      value.roomId = reader.readString();
      if (count == 2) return value;
      value.users = reader.readArray(reader => RoomUserInfo.deserializeCore(reader));
      if (count == 3) return value;
    }
    return value;
  }

  static deserializeArray(buffer: ArrayBuffer): (RoomUsersUpdateEvent | null)[] | null {
    return this.deserializeArrayCore(new MemoryPackReader(buffer));
  }

  static deserializeArrayCore(reader: MemoryPackReader): (RoomUsersUpdateEvent | null)[] | null {
    return reader.readArray(reader => RoomUsersUpdateEvent.deserializeCore(reader));
  }
}
