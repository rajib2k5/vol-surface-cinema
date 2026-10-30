import { describe, expect, it } from 'vitest'
import { sequenceIvExtent } from './extent.ts'
import type { Sequence } from './contract.ts'

const seq = (frames: number[][][], display?: Sequence['display']) => ({ frames: frames.map((iv) => ({ date: 'x', iv })), display }) as unknown as Sequence

describe('sequenceIvExtent', () => {
  it('defaults to the global min and max over ALL frames and cells', () => {
    const s = seq([[[0.2, 0.3], [0.25, 0.22]], [[0.1, 0.5], [0.4, 0.6]]])
    expect(sequenceIvExtent(s)).toEqual([0.1, 0.6])
  })
  it('uses display.iv_range when given, even if the data goes outside it', () => {
    const s = seq([[[0.2, 0.3], [0.25, 0.22]]], { iv_range: [0.05, 0.9] })
    expect(sequenceIvExtent(s)).toEqual([0.05, 0.9])
  })
  it('a flat sequence gives a degenerate [v, v] extent rather than throwing', () => {
    expect(sequenceIvExtent(seq([[[0.2, 0.2], [0.2, 0.2]]]))).toEqual([0.2, 0.2])
  })
})
