import type { Easing } from './contract.ts'

/** Easing curve on x in [0, 1]. Monotone, ease(0) = 0, ease(1) = 1. Pure. */
export function ease(kind: Easing, x: number): number {
  if (!(x >= 0 && x <= 1)) throw new RangeError(`ease needs x in [0, 1], got ${x}`)
  switch (kind) {
    case 'linear':
      return x
    case 'smoothstep':
      return x * x * (3 - 2 * x)
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
  }
}
