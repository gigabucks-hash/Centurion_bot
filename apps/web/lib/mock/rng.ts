/** Deterministic PRNG so mock data is stable across server/client renders and builds. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export const intBetween = (rng: Rng, min: number, max: number) => Math.floor(between(rng, min, max + 1));
export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Fake base58 mint-like id. NOT a real token. */
export function fakeMint(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 44; i++) s += B58[Math.floor(rng() * B58.length)];
  return s;
}
