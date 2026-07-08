import { describe, it, expect } from 'vitest';
import { ChatMessageRequest } from './ChatMessageRequest';
import { ChatMessageEvent } from './ChatMessageEvent';
import { JoinRoomRequest } from './JoinRoomRequest';

// Fixed binary samples captured from a known-good encode of each message (see the
// roadmap's stage-4 test item). These pin the wire format independently of whatever
// serialize()/deserialize() happen to agree on today — a byte-layout regression in
// either direction (or a drift from the server's MemoryPack encoding) breaks this
// test even if the TS round-trip alone would still "work".
describe('protocol round-trip against fixed binary samples', () => {
  it('ChatMessageRequest("hi") matches the pinned byte layout', () => {
    const value = new ChatMessageRequest();
    value.message = 'hi';

    const bytes = Array.from(ChatMessageRequest.serialize(value));
    expect(bytes).toEqual([1, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105]);

    const decoded = ChatMessageRequest.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.message).toBe('hi');
  });

  it('ChatMessageEvent(7, "hi") matches the pinned byte layout', () => {
    const value = new ChatMessageEvent();
    value.clientId = 7;
    value.message = 'hi';

    const bytes = Array.from(ChatMessageEvent.serialize(value));
    expect(bytes).toEqual([2, 7, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105]);

    const decoded = ChatMessageEvent.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.clientId).toBe(7);
    expect(decoded!.message).toBe('hi');
  });

  it('JoinRoomRequest("game") matches the pinned byte layout', () => {
    const value = new JoinRoomRequest();
    value.roomId = 'game';

    const bytes = Array.from(JoinRoomRequest.serialize(value));
    expect(bytes).toEqual([
      2, 255, 255, 255, 255, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101,
    ]);

    const decoded = JoinRoomRequest.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.roomId).toBe('game');
  });

  it('round-trips a variety of chat message payloads, including empty and unicode', () => {
    for (const message of ['', 'a', 'hello world', 'emoji: 🎮', 'x'.repeat(500)]) {
      const value = new ChatMessageRequest();
      value.message = message;

      const decoded = ChatMessageRequest.deserialize(
        ChatMessageRequest.serialize(value).buffer as ArrayBuffer
      );

      expect(decoded!.message).toBe(message);
    }
  });

  it('deserialize on a null-encoded object returns null', () => {
    const value: ChatMessageRequest | null = null;
    const bytes = ChatMessageRequest.serialize(value);

    expect(ChatMessageRequest.deserialize(bytes.buffer as ArrayBuffer)).toBeNull();
  });
});
