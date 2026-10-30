/** Seeded generators for the synthetic story. Pure, no clock, no Math.random. */

/** mulberry32: a small 32-bit PRNG. Returns a function giving uniform numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One standard normal draw (Box-Muller). Uses two uniforms, keeps no state between calls. */
export function gaussian(rng: () => number): number {
  const u1 = 1 - rng() // in (0, 1], so log is finite
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
