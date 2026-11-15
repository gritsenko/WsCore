import { describe, it, expect } from 'vitest';
import { ChatEntry, ChatHistoryPage, ChatLogStore } from './ChatLog';

const entry = (id: number): ChatEntry => ({
  id,
  userId: 1,
  name: 'Ann',
  text: `m${id}`,
  sentAtMs: id,
});

function page(roomId: string, ids: number[], opts: Partial<ChatHistoryPage> = {}): ChatHistoryPage {
  return {
    roomId,
    epoch: 1,
    beforeId: 0,
    reset: false,
    hasMore: false,
    messages: ids.map(entry),
    ...opts,
  };
}

const ids = (store: ChatLogStore, roomId: string) => store.room(roomId).entries.map(e => e.id);

describe('ChatLogStore', () => {
  it('a reset page replaces the room log', () => {
    const store = new ChatLogStore();
    store.applyHistory(page('lobby', [1, 2], { reset: true }));

    const change = store.applyHistory(page('lobby', [8, 9], { reset: true, hasMore: true }));

    expect(change).toEqual({ kind: 'reset' });
    expect(ids(store, 'lobby')).toEqual([8, 9]);
    expect(store.room('lobby').hasMore).toBe(true);
  });

  it('a catch-up appends only what is newer than the log', () => {
    const store = new ChatLogStore();
    store.applyHistory(page('lobby', [1, 2], { reset: true }));
    store.addLive('lobby', entry(3)); // raced ahead of the catch-up

    const change = store.applyHistory(page('lobby', [3, 4]));

    expect(change).toEqual({ kind: 'append', entries: [entry(4)] });
    expect(ids(store, 'lobby')).toEqual([1, 2, 3, 4]);
  });

  it('an older page is prepended and updates hasMore', () => {
    const store = new ChatLogStore();
    store.applyHistory(page('lobby', [10, 11], { reset: true, hasMore: true }));
    store.room('lobby').loadingOlder = true;

    const change = store.applyHistory(page('lobby', [8, 9], { beforeId: 10, hasMore: false }));

    expect(change).toEqual({ kind: 'prepend', entries: [entry(8), entry(9)] });
    expect(ids(store, 'lobby')).toEqual([8, 9, 10, 11]);
    expect(store.room('lobby').hasMore).toBe(false);
    expect(store.room('lobby').loadingOlder).toBe(false);
  });

  it('an older page for a cursor we no longer have is ignored', () => {
    const store = new ChatLogStore();
    store.applyHistory(page('lobby', [10, 11], { reset: true, hasMore: true }));
    store.applyHistory(page('lobby', [20, 21], { reset: true, hasMore: true })); // replaced

    expect(store.applyHistory(page('lobby', [8, 9], { beforeId: 10 }))).toBeNull();
    expect(ids(store, 'lobby')).toEqual([20, 21]);
  });

  it('live messages are deduplicated by id', () => {
    const store = new ChatLogStore();
    expect(store.addLive('lobby', entry(5))).toBe('added');
    expect(store.addLive('lobby', entry(5))).toBe('duplicate');
    expect(store.addLive('lobby', entry(4))).toBe('duplicate'); // older than the tail
    expect(ids(store, 'lobby')).toEqual([5]);
  });

  it('rooms are independent', () => {
    const store = new ChatLogStore();
    store.addLive('lobby', entry(1));
    store.addLive('game', entry(2));
    expect(ids(store, 'lobby')).toEqual([1]);
    expect(ids(store, 'game')).toEqual([2]);
  });

  it('caps a room log, dropping the oldest and marking that more can be loaded', () => {
    const store = new ChatLogStore();
    const results = new Set<string>();
    for (let id = 1; id <= ChatLogStore.MAX_PER_ROOM + 150; id++) {
      results.add(store.addLive('lobby', entry(id)));
    }

    const log = store.room('lobby');
    expect(results.has('trimmed')).toBe(true);
    expect(log.entries.length).toBeLessThanOrEqual(ChatLogStore.MAX_PER_ROOM + 100);
    expect(log.lastId).toBe(ChatLogStore.MAX_PER_ROOM + 150);
    expect(log.firstId).toBeGreaterThan(1);
    expect(log.hasMore).toBe(true);
  });

  it('a new epoch invalidates every cached room, even for a non-reset page', () => {
    const store = new ChatLogStore();
    store.applyHistory(page('lobby', [1, 2], { reset: true }));
    store.applyHistory(page('game', [3], { reset: true }));

    const change = store.applyHistory(page('lobby', [1], { epoch: 2 }));

    expect(change).toEqual({ kind: 'reset' });
    expect(store.epoch).toBe(2);
    expect(ids(store, 'lobby')).toEqual([1]);
    expect(ids(store, 'game')).toEqual([]);
  });
});
