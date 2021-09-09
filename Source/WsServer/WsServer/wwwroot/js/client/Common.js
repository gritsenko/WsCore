export function isBitSet(target, i) {
    return target & (1 << i);
}

export function setBit(target, i) {
    const mask = 1 << i;
    target |= mask;
    return target;
}

export function clearBit(target, i) {
    const mask = 1 << i;
    target &= ~mask;
    return target;
}

export function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length - size);
}

export function lerp(v0, v1, t) {
    return v0 * (1 - t) + v1 * t;
}