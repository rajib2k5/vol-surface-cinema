/** Camera orbit as a function of the frame index. Pure. */
import { ORBIT_TARGET } from './surfaceScene.ts'

/** SurfaceHero's camera start. It fixes the orbit radius, height and starting azimuth a0. */
export const CAMERA_START: [number, number, number] = [1.9, 1.35, 2.5]

const DX = CAMERA_START[0] - ORBIT_TARGET[0]
const DZ = CAMERA_START[2] - ORBIT_TARGET[2]
const RADIUS = Math.hypot(DX, DZ)

/** The starting azimuth a0, measured from +z toward +x. */
export const AZIMUTH_0 = Math.atan2(DX, DZ)

/** a0 + 2 pi * turns * n / total. With an integer number of turns the loop is seamless; with 0 there is no orbit. */
export function orbitAzimuth(turns: number, n: number, total: number): number {
  return AZIMUTH_0 + (2 * Math.PI * turns * n) / total
}

/** Camera position for an azimuth: the start height and horizontal radius around ORBIT_TARGET. */
export function cameraPosition(azimuth: number): [number, number, number] {
  return [ORBIT_TARGET[0] + RADIUS * Math.sin(azimuth), CAMERA_START[1], ORBIT_TARGET[2] + RADIUS * Math.cos(azimuth)]
}
