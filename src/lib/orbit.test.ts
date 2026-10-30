import { describe, expect, it } from 'vitest'
import { AZIMUTH_0, CAMERA_START, cameraPosition, orbitAzimuth } from './orbit.ts'
import { ORBIT_TARGET } from './surfaceScene.ts'

describe('orbitAzimuth: a0 + 2 pi * turns * n / total', () => {
  it('with 0 turns the camera never moves', () => {
    for (const n of [0, 7, 99]) expect(orbitAzimuth(0, n, 100)).toBe(AZIMUTH_0)
  })
  it('1 turn: a quarter of the way is a0 + pi/2, half is a0 + pi', () => {
    expect(orbitAzimuth(1, 25, 100)).toBeCloseTo(AZIMUTH_0 + Math.PI / 2, 12)
    expect(orbitAzimuth(1, 50, 100)).toBeCloseTo(AZIMUTH_0 + Math.PI, 12)
  })
  it('seamless loop: with an integer number of turns the camera at n = total is where it was at n = 0', () => {
    for (const turns of [1, 2, 3]) {
      const a = cameraPosition(orbitAzimuth(turns, 0, 450))
      const b = cameraPosition(orbitAzimuth(turns, 450, 450))
      a.forEach((c, i) => expect(b[i]).toBeCloseTo(c, 9))
    }
  })
  it('is a pure function of n: the same inputs give the same output', () => {
    expect(orbitAzimuth(2, 123, 450)).toBe(orbitAzimuth(2, 123, 450))
  })
})

describe('cameraPosition', () => {
  it('at a0 it is exactly SurfaceHero\'s start [1.9, 1.35, 2.5]', () => {
    const p = cameraPosition(AZIMUTH_0)
    expect(p[0]).toBeCloseTo(1.9, 12)
    expect(p[1]).toBe(1.35)
    expect(p[2]).toBeCloseTo(2.5, 12)
    expect(CAMERA_START).toEqual([1.9, 1.35, 2.5])
  })
  it('keeps height and horizontal distance to the orbit target at every azimuth', () => {
    const r0 = Math.hypot(1.9 - ORBIT_TARGET[0], 2.5 - ORBIT_TARGET[2])
    for (const a of [0, 1, 2.5, 4, 6]) {
      const p = cameraPosition(a)
      expect(p[1]).toBe(1.35)
      expect(Math.hypot(p[0] - ORBIT_TARGET[0], p[2] - ORBIT_TARGET[2])).toBeCloseTo(r0, 12)
    }
  })
  it('azimuth pi/2 beyond a0 moves the camera a quarter turn around the target (hand-worked)', () => {
    // offset (dx, dz) = (1.4, 2.0). Rotating the azimuth by +90deg: (dx', dz') = (dz, -dx) = (2.0, -1.4).
    const p = cameraPosition(AZIMUTH_0 + Math.PI / 2)
    expect(p[0]).toBeCloseTo(0.5 + 2.0, 9)
    expect(p[2]).toBeCloseTo(0.5 - 1.4, 9)
  })
})
