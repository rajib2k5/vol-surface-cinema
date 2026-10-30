import { describe, expect, it } from 'vitest'
import { createPlayer } from './player.ts'

function setup(opts: { total?: number; fps?: number; loop?: boolean } = {}) {
  let t = 1000
  const player = createPlayer({ total: opts.total ?? 10, fps: opts.fps ?? 10, loop: opts.loop ?? false, now: () => t })
  return { player, advance: (ms: number) => (t += ms) }
}

describe('createPlayer', () => {
  it('starts paused at frame 0 and stays there while the clock runs', () => {
    const { player, advance } = setup()
    expect(player.state()).toBe('paused')
    advance(5000)
    expect(player.current()).toBe(0)
  })
  it('play() advances one frame per 1000/fps ms: 10 fps, 250 ms -> frame 2 (floor)', () => {
    const { player, advance } = setup()
    player.play()
    expect(player.state()).toBe('playing')
    advance(99)
    expect(player.current()).toBe(0)
    advance(1) // 100 ms
    expect(player.current()).toBe(1)
    advance(150) // 250 ms
    expect(player.current()).toBe(2)
  })
  it('pause() freezes n', () => {
    const { player, advance } = setup()
    player.play()
    advance(300)
    player.pause()
    expect(player.state()).toBe('paused')
    expect(player.current()).toBe(3)
    advance(10_000)
    expect(player.current()).toBe(3)
  })
  it('play() after pause continues from the frozen frame', () => {
    const { player, advance } = setup({ total: 100 })
    player.play()
    advance(300)
    player.pause()
    advance(5000)
    player.play()
    advance(200)
    expect(player.current()).toBe(5)
  })
  it('with loop the frame is taken modulo total', () => {
    const { player, advance } = setup({ total: 10, loop: true })
    player.play()
    advance(1000) // 10 frames
    expect(player.current()).toBe(0)
    advance(350)
    expect(player.current()).toBe(3)
    expect(player.state()).toBe('playing')
  })
  it('without loop it ends at total - 1 and stays there', () => {
    const { player, advance } = setup({ total: 10, loop: false })
    player.play()
    advance(5000)
    expect(player.current()).toBe(9)
    expect(player.state()).toBe('ended')
    advance(5000)
    expect(player.current()).toBe(9)
  })
  it('reaching the last frame exactly is ended; one frame earlier is still playing', () => {
    const { player, advance } = setup({ total: 10 })
    player.play()
    advance(800)
    expect(player.current()).toBe(8)
    expect(player.state()).toBe('playing')
    advance(100)
    expect(player.current()).toBe(9)
    expect(player.state()).toBe('ended')
  })
  it('play() from ended restarts at 0', () => {
    const { player, advance } = setup({ total: 10 })
    player.play()
    advance(5000)
    expect(player.state()).toBe('ended')
    player.play()
    expect(player.state()).toBe('playing')
    expect(player.current()).toBe(0)
    advance(200)
    expect(player.current()).toBe(2)
  })
  it('play() while paused on the last frame of a non-looping player restarts at 0 instead of ending at once', () => {
    const { player } = setup({ total: 10 })
    player.seek(9)
    player.play()
    expect(player.current()).toBe(0)
  })
  it('seek(n) clamps to [0, total - 1] and keeps paused', () => {
    const { player } = setup()
    player.seek(4)
    expect(player.current()).toBe(4)
    expect(player.state()).toBe('paused')
    player.seek(-5)
    expect(player.current()).toBe(0)
    player.seek(99)
    expect(player.current()).toBe(9)
  })
  it('seek while playing keeps playing and continues from the new frame', () => {
    const { player, advance } = setup({ total: 100 })
    player.play()
    advance(500)
    player.seek(40)
    expect(player.state()).toBe('playing')
    expect(player.current()).toBe(40)
    advance(300)
    expect(player.current()).toBe(43)
  })
  it('seek from ended goes to paused', () => {
    const { player, advance } = setup({ total: 10 })
    player.play()
    advance(5000)
    player.seek(3)
    expect(player.state()).toBe('paused')
    expect(player.current()).toBe(3)
  })
  it('seek rounds a fractional frame down and rejects NaN', () => {
    const { player } = setup()
    player.seek(3.9)
    expect(player.current()).toBe(3)
    expect(() => player.seek(NaN)).toThrow(RangeError)
  })
  it('rejects bad construction: total < 1, fps < 1', () => {
    expect(() => createPlayer({ total: 0, fps: 30, loop: true, now: () => 0 })).toThrow(RangeError)
    expect(() => createPlayer({ total: 5, fps: 0, loop: true, now: () => 0 })).toThrow(RangeError)
  })
  it('does not lose a frame to floating point at fractional clocks (performance.now): 30 fps, 100 ms -> frame 3', () => {
    let t = 123.4
    const p = createPlayer({ total: 1000, fps: 30, loop: false, now: () => t })
    p.play()
    t += 100
    expect(p.current()).toBe(3)
  })
})
