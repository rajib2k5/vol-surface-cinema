// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT.
/**
 * Sequential colour ramp for the volatility surface: viridis, low IV = dark purple, high IV = yellow.
 *
 * Why viridis: the earlier single-hue light-to-dark blue ramp looked like one pale blue over the whole
 * surface, so colour barely showed IV. Viridis runs through blue, green and yellow with steadily rising
 * lightness and stays readable in greyscale and for common colour-vision deficiencies. It is also the
 * ramp of tools/blender/render_surface_sequence.py, so the page and a Blender render agree.
 *
 * The 33 stops are viridis sampled every 1/32 from matplotlib 3.11.0 (matplotlib's viridis colormap is
 * CC0, by Nathaniel Smith and Stefan van der Walt), copied unchanged from the Blender script's _VIRIDIS.
 * They are sRGB components in 0..1.
 *
 * These figures describe the ramp as drawn on screen only because the renderer sets
 * toneMapping = NoToneMapping. Any tone mapping would shift every colour above and make the
 * heatmap fallback (built from rampSrgb) disagree with the 3D surface.
 *
 * Pure: no I/O, no DOM.
 */

export type Rgb = [number, number, number]

export const RAMP_STOPS: readonly Readonly<Rgb>[] = [
  [0.2670, 0.0049, 0.3294], [0.2770, 0.0503, 0.3757], [0.2823, 0.0950, 0.4173],
  [0.2829, 0.1359, 0.4534], [0.2788, 0.1755, 0.4834], [0.2706, 0.2141, 0.5071],
  [0.2590, 0.2515, 0.5247], [0.2450, 0.2877, 0.5373], [0.2297, 0.3224, 0.5457],
  [0.2143, 0.3556, 0.5512], [0.1994, 0.3876, 0.5546], [0.1856, 0.4186, 0.5568],
  [0.1727, 0.4488, 0.5579], [0.1607, 0.4785, 0.5581], [0.1490, 0.5081, 0.5573],
  [0.1378, 0.5375, 0.5549], [0.1276, 0.5669, 0.5506], [0.1206, 0.5964, 0.5436],
  [0.1206, 0.6258, 0.5335], [0.1323, 0.6550, 0.5197], [0.1579, 0.6838, 0.5017],
  [0.1966, 0.7118, 0.4792], [0.2461, 0.7389, 0.4520], [0.3041, 0.7647, 0.4199],
  [0.3692, 0.7889, 0.3829], [0.4401, 0.8111, 0.3410], [0.5160, 0.8312, 0.2943],
  [0.5958, 0.8487, 0.2433], [0.6785, 0.8637, 0.1895], [0.7624, 0.8764, 0.1371],
  [0.8456, 0.8873, 0.0997], [0.9261, 0.8973, 0.1041], [0.9932, 0.9062, 0.1439],
]

/** sRGB transfer function, decoded: one 0..1 sRGB component -> linear light (IEC 61966-2-1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * Colour at position t in [0, 1] along the ramp, as sRGB components in 0..1.
 * Piecewise-linear between adjacent anchors; t outside [0, 1] clamps to the ends.
 */
export function rampSrgb(t: number): Rgb {
  if (Number.isNaN(t)) throw new RangeError('ramp position must be a number')
  const clamped = Math.min(1, Math.max(0, t))
  const segments = RAMP_STOPS.length - 1
  const pos = clamped * segments
  const i = Math.min(Math.floor(pos), segments - 1)
  const f = pos - i
  const a = RAMP_STOPS[i]
  const b = RAMP_STOPS[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/**
 * Same colour in linear light. three.js treats vertex-colour attributes as linear and applies the
 * sRGB encoding itself on output, so the vertex buffer must hold these values, not rampSrgb's.
 */
export function rampLinear(t: number): Rgb {
  const [r, g, b] = rampSrgb(t)
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}
