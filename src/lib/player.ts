/**
 * Turns wall-clock time into the frame index n. The only place a clock is read, and `now` is
 * injected (milliseconds, performance.now) so tests use a fake one.
 */
export type PlayerState = 'playing' | 'paused' | 'ended'

export interface Player {
  play(): void
  pause(): void
  seek(n: number): void
  current(): number
  state(): PlayerState
}

export interface PlayerOptions {
  total: number
  fps: number
  loop: boolean
  now: () => number
}

export function createPlayer({ total, fps, loop, now }: PlayerOptions): Player {
  if (!(Number.isInteger(total) && total >= 1)) throw new RangeError(`total must be an integer >= 1, got ${total}`)
  if (!(fps >= 1)) throw new RangeError(`fps must be >= 1, got ${fps}`)

  let n0 = 0
  let t0 = now()
  let playing = false
  let ended = false

  function compute(): number {
    if (!playing) return n0
    const n = n0 + Math.floor(((now() - t0) * fps) / 1000 + 1e-9)
    if (loop) return n % total
    if (n >= total - 1) {
      playing = false
      ended = true
      n0 = total - 1
      return n0
    }
    return n
  }

  return {
    play() {
      compute()
      if (playing) return
      if (ended || (!loop && n0 >= total - 1)) n0 = 0
      ended = false
      t0 = now()
      playing = true
    },
    pause() {
      n0 = compute()
      playing = false
    },
    seek(n) {
      if (Number.isNaN(n)) throw new RangeError('seek needs a number')
      compute() // settle 'ended' first, so a seek from ended lands paused
      n0 = Math.min(total - 1, Math.max(0, Math.floor(n)))
      t0 = now()
      ended = false
    },
    current: compute,
    state() {
      compute()
      return ended ? 'ended' : playing ? 'playing' : 'paused'
    },
  }
}
