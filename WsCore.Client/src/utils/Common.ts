export function isBitSet(target: number, i: number): number {
  return target & (1 << i);
}

export function setBit(target: number, i: number): number {
  const mask = 1 << i;
  target |= mask;
  return target;
}

export function clearBit(target: number, i: number): number {
  const mask = 1 << i;
  target &= ~mask;
  return target;
}

export function pad(num: number, size: number): string {
  var s = '000000000' + num;
  return s.substr(s.length - size);
}

export function lerp(v0: number, v1: number, t: number): number {
  return v0 * (1 - t) + v1 * t;
}
