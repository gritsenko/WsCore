import { describe, it, expect } from 'vitest';
import { absolutizeAvatars, addPending, parsePanel, sdkArgs } from './Leaderboard';

describe('Leaderboard helpers', () => {
  it('makes avatar paths absolute wherever they are', () => {
    const answer = {
      entries: [
        { avatarUrl: '/avatars/3?v=9', player: { avatarUrl: '/avatars/3?v=9', publicName: 'Al' } },
        { avatarUrl: null },
      ],
      leaderboard: { name: 'best' },
    };
    expect(absolutizeAvatars(answer, p => `http://srv${p}`)).toEqual({
      entries: [
        {
          avatarUrl: 'http://srv/avatars/3?v=9',
          player: { avatarUrl: 'http://srv/avatars/3?v=9', publicName: 'Al' },
        },
        { avatarUrl: null },
      ],
      leaderboard: { name: 'best' },
    });
  });

  it('maps the SDK proxy arguments', () => {
    expect(sdkArgs('score', { score: 12.9, extraData: 7 })).toEqual({ score: 12, extraData: '7' });
    expect(sdkArgs('score', { score: 'x' }).score).toBeNaN();
    expect(sdkArgs('entries', { top: 5, around: 1, includeUser: false })).toEqual({
      top: 5,
      around: 1,
      includeUser: false,
    });
    expect(sdkArgs('entries', {})).toEqual({ top: 10, around: 3, includeUser: true });
    expect(sdkArgs('player', { anything: 1 })).toEqual({});
  });

  it('reads the panel payload and skips junk', () => {
    const boards = parsePanel([
      {
        description: {
          name: 'best',
          titleText: 'Очки',
          titleRaw: 'Очки',
          entryCount: 2,
          description: {
            invert_sort_order: true,
            type: 'time',
            score_format: { options: { decimal_offset: 0 } },
          },
        },
        entries: [{ rank: 1, formattedScore: '1:00', name: 'Al', username: 'al', own: true }],
        myRank: 2,
        myEntry: { rank: 2, formattedScore: '2:00', name: 'Me', isPlayer: true },
        ownCount: 1,
      },
      { nonsense: true },
    ]);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({
      name: 'best',
      title: 'Очки',
      invertSortOrder: true,
      scoreType: 'time',
      myRank: 2,
    });
    expect(boards[0].entries[0]).toMatchObject({ rank: 1, username: 'al', own: true });
    expect(parsePanel(null)).toEqual([]);
  });

  it('keeps the highest and the lowest pending score per board', () => {
    let all = addPending({}, 'g', 'best', { score: 10, extraData: 'a' });
    all = addPending(all, 'g', 'best', { score: 30, extraData: 'b' });
    all = addPending(all, 'g', 'best', { score: 5, extraData: 'c' });
    expect(all.g.best).toEqual({
      max: { score: 30, extraData: 'b' },
      min: { score: 5, extraData: 'c' },
    });
  });
});
