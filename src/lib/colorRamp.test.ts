// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT.
import { describe, expect, it } from 'vitest'
import { RAMP_STOPS, rampLinear, rampSrgb, srgbToLinear } from './colorRamp.ts'

// External reference for viridis (matplotlib, CC0): viridis(0) = #440154, viridis(0.5) = #21918c, viridis(1) = #fde725.
// At 4 decimals the matplotlib 3.11.0 samples are (0.2670, 0.0049, 0.3294), (0.1276, 0.5669, 0.5506), (0.9932, 0.9062, 0.1439).
// Stop 1 of 33 is (0.2770, 0.0503, 0.3757), so t = 1/64 (half way from stop 0 to stop 1) is their mean by hand:
// (0.2720, 0.0276, 0.35255). The linear-light values below were decoded from those with the IEC 61966-2-1 formula.
const VIRIDIS_0: [number, number, number] = [0.267, 0.0049, 0.3294]
const VIRIDIS_MID: [number, number, number] = [0.1276, 0.5669, 0.5506]
const VIRIDIS_1: [number, number, number] = [0.9932, 0.9062, 0.1439]
const closeTo = (a: number[], b: number[], digits = 12) => {
  expect(a).toHaveLength(b.length)
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], digits))
}

describe('srgbToLinear', () => {
  // External reference: IEC 61966-2-1 sRGB decoding. 0.5 -> 0.214041 is the standard worked example;
  // 0.04045 is the knee where the linear segment (c / 12.92) meets the power segment.
  it('matches the standard transfer function at known points', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBeCloseTo(1, 12)
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 6)
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12) // = 0.0031308
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12) // below the knee: linear segment
  })
})

describe('RAMP_STOPS (viridis, 33 stops every 1/32)', () => {
  it('has 33 stops with components in 0..1 and the matplotlib values at t = 0, 0.5 and 1', () => {
    expect(RAMP_STOPS).toHaveLength(33)
    for (const s of RAMP_STOPS) {
      expect(s).toHaveLength(3)
      for (const c of s) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
    closeTo([...RAMP_STOPS[0]], VIRIDIS_0)
    closeTo([...RAMP_STOPS[16]], VIRIDIS_MID)
    closeTo([...RAMP_STOPS[32]], VIRIDIS_1)
  })
})

describe('rampSrgb', () => {
  it('hits the first, middle and last stops exactly at t = 0, 0.5 and 1', () => {
    closeTo(rampSrgb(0), VIRIDIS_0)
    closeTo(rampSrgb(0.5), VIRIDIS_MID)
    closeTo(rampSrgb(1), VIRIDIS_1)
  })
  it('interpolates linearly between adjacent stops', () => {
    closeTo(rampSrgb(1 / 64), [0.272, 0.0276, 0.35255])
  })
  it('clamps positions outside [0, 1] and rejects NaN', () => {
    expect(rampSrgb(-5)).toEqual(rampSrgb(0))
    expect(rampSrgb(7)).toEqual(rampSrgb(1))
    expect(rampSrgb(Infinity)).toEqual(rampSrgb(1))
    expect(() => rampSrgb(NaN)).toThrow(RangeError)
  })
  it('gets monotonically lighter (relative luminance strictly rises) along the whole ramp, as viridis does', () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
    let prev = -Infinity
    for (let k = 0; k <= 100; k++) {
      const y = lum(rampSrgb(k / 100))
      expect(y, `luminance at t=${k / 100}`).toBeGreaterThan(prev)
      prev = y
    }
  })
  it('varies a lot across the range: the ends differ by more than 0.5 in some channel', () => {
    const lo = rampSrgb(0)
    const hi = rampSrgb(1)
    expect(Math.max(...lo.map((c, i) => Math.abs(c - hi[i])))).toBeGreaterThan(0.5)
  })
})

describe('rampLinear', () => {
  // Independent reference values, decoded from the sRGB samples above with the sRGB formula:
  //   viridis(0) -> (0.057949, 0.000379, 0.088649)   viridis(0.5) -> (0.014852, 0.281270, 0.263900)
  //   viridis(1) -> (0.984601, 0.799737, 0.018235)   t = 1/64 -> (0.060132, 0.002136, 0.102007)
  it('returns linear-light colours at the ends, the middle and between stops', () => {
    closeTo(rampLinear(0), [0.057949, 0.000379, 0.088649], 6)
    closeTo(rampLinear(0.5), [0.014852, 0.28127, 0.2639], 6)
    closeTo(rampLinear(1), [0.984601, 0.799737, 0.018235], 6)
    closeTo(rampLinear(1 / 64), [0.060132, 0.002136, 0.102007], 6)
  })
})
