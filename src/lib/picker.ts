/** Pure parts of the controls: key mapping and the date/event list. */
import type { TimelineSpec } from './timeline.ts'
import { startFrameOf } from './timeline.ts'

export type KeyAction = 'toggle' | 'prev' | 'next'

export function keyAction(key: string): KeyAction | null {
  if (key === ' ') return 'toggle'
  if (key === 'ArrowLeft') return 'prev'
  if (key === 'ArrowRight') return 'next'
  return null
}

export interface PickerItem {
  label: string
  frame: number
  /** The label of an event on this date, or null. */
  event: string | null
}

export function pickerItems(spec: TimelineSpec, dates: readonly string[], events: readonly { dateIndex: number; label: string }[]): PickerItem[] {
  return dates.map((label, i) => ({ label, frame: startFrameOf(spec, i), event: events.find((e) => e.dateIndex === i)?.label ?? null }))
}
