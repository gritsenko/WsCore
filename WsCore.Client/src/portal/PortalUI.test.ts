import { describe, it, expect } from 'vitest';
import { plays } from './PortalUI';

describe('plays', () => {
  it('words the count in Russian', () => {
    expect(plays(1)).toBe('1 партия');
    expect(plays(3)).toBe('3 партии');
    expect(plays(5)).toBe('5 партий');
    expect(plays(11)).toBe('11 партий');
    expect(plays(22)).toBe('22 партии');
    expect(plays(112)).toBe('112 партий');
    expect(plays(121)).toBe('121 партия');
    expect(plays(1000)).toBe('1 тыс. партий');
    expect(plays(1250)).toBe('1,3 тыс. партий');
    expect(plays(2_400_000)).toBe('2,4 млн партий');
  });
});
