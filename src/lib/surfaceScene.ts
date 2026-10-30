// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT.
/**
 * The exact buffers and constants the 3D hero hands to three.js, kept as plain data so a test can
 * check them without a GPU. render/scene.ts only forwards these into BufferAttributes;
 * the decisions (which array is the position buffer, which index list the filled mesh draws, where
 * the axis lines run) live here, where hand-worked values can pin them.
 *
 * Why this matters: all of these arrays are plain numbers, so a swapped pair (colours read as
 * positions, wireframe indices fed to the mesh) draws a plausible-looking mess instead of
 * throwing. Nothing but a test that knows the right answer will notice.
 *
 * Pure: no I/O, no DOM, no three.js import.
 */
import type { SurfaceGeometry, Vec3 } from './surfaceGeometry.ts'

export interface MeshAttributes {
  /** x, y, z per vertex (3 numbers each). The filled mesh and the wireframe both read these. */
  position: Float32Array
  /** r, g, b per vertex, in linear light. Only the filled mesh is coloured. */
  color: Float32Array
  /** Triangle corners (3 per triangle): the index buffer of the FILLED mesh. */
  index: Uint32Array
  /** Segment end points (2 per segment): the index buffer of the WIREFRAME. */
  lineIndex: Uint32Array
}

/** Name each buffer of a surface geometry by the job it does in the scene. */
export function meshAttributes(geo: SurfaceGeometry): MeshAttributes {
  return { position: geo.positions, color: geo.colors, index: geo.indices, lineIndex: geo.lineIndices }
}

/**
 * The three axis lines of the unit box, as 3 segments of 2 points (x, y, z each). They are the
 * three edges the tick labels in axisLabels() hang off, which is why each runs from the minimum to
 * the maximum of its axis:
 *   x axis, log-moneyness: along the front edge        (0,0,1) to (1,0,1)
 *   z axis, days to expiry: along the right edge       (1,0,1) to (1,0,0)
 *   y axis, implied vol:    up the front-left edge     (0,0,1) to (0,1,1)
 */
export const AXIS_SEGMENTS = new Float32Array([
  0, 0, 1, 1, 0, 1, // x axis
  1, 0, 1, 1, 0, 0, // z axis
  0, 0, 1, 0, 1, 1, // y axis
])

/**
 * The point the camera orbits around, in unit-box coordinates: the middle of x and z, and below the
 * middle of y (0.25, not 0.5) because the surface sits low in the box. IV is scaled to the sequence-wide
 * min and max, and the steep short-dated put wing of the volatility spike sets the maximum, so the synthetic story has a
 * mean normalised height of about 0.14.
 */
export const ORBIT_TARGET: Vec3 = [0.5, 0.25, 0.5]
