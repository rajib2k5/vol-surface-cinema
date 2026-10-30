// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT.
/** True when this browser can create a WebGL context. `doc` is injectable so tests can fake it. */
export function detectWebGL(doc: Pick<Document, 'createElement'> = document): boolean {
  try {
    const canvas = doc.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
