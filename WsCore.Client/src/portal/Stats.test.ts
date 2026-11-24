import { describe, it, expect } from 'vitest';
import { compact, duration, fillDays, niceTicks, parseStats, percent, sumDays } from './Stats';

const day = (d: string, plays = 1) => ({
  day: d,
  views: 2,
  launches: 1,
  plays,
  activeMs: 1000,
  players: 1,
});

describe('Stats', () => {
  it('fills every day of the period, oldest first', () => {
    const days = fillDays(
      [day('2026-11-22', 3), day('2026-11-24')],
      4,
      new Date('2026-11-24T15:00:00Z')
    );
    expect(days.map(d => [d.day, d.plays])).toEqual([
      ['2026-11-21', 0],
      ['2026-11-22', 3],
      ['2026-11-23', 0],
      ['2026-11-24', 1],
    ]);
    expect(sumDays(days)).toEqual({ views: 4, launches: 2, plays: 4, activeMs: 2000 });
  });

  it('makes round ticks', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('formats numbers, durations and shares', () => {
    expect(compact(1284)).toBe((1284).toLocaleString('ru-RU'));
    expect(compact(12_940)).toBe('12,9 тыс.');
    expect(compact(4_200_000)).toBe('4,2 млн');
    expect(duration(42_000)).toBe('0:42');
    expect(duration(187_000)).toBe('3:07');
    expect(duration(3_900_000)).toBe('1 ч 05 мин');
    expect(percent(1, 3)).toBe('33%');
    expect(percent(1, 0)).toBe('—');
  });

  it('reads the API answer, tolerating gaps', () => {
    const stats = parseStats({ days: 7, players: 3, daily: [day('2026-11-24')] });
    expect(stats.days).toBe(7);
    expect(stats.events).toEqual([]);
    expect(stats.sessions.sessions).toBe(0);
    expect(stats.daily).toHaveLength(1);
  });
});
