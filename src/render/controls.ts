/**
 * Play/pause, scrubber, date and event picker, keyboard. Idea for the picker (a row of buttons, one
 * per date, aria-pressed on the chosen one) from views/SurfacePage.tsx in vol-strategy-backtester.
 * Controls only call the player; the render loop in main.ts shows whatever frame the player is on.
 */
import { keyAction, pickerItems } from '../lib/picker.ts'
import type { Player } from '../lib/player.ts'
import type { TimelineSpec } from '../lib/timeline.ts'

export interface Controls {
  /** Reflect frame n and the player state in the widgets. */
  sync(n: number, state: 'playing' | 'paused' | 'ended'): void
  dispose(): void
}

export interface ControlsOptions {
  host: HTMLElement
  spec: TimelineSpec
  total: number
  dates: readonly string[]
  events: readonly { dateIndex: number; label: string }[]
  player: Player
  /** Called after any user action so the loop can redraw at once. */
  onUserAction: () => void
}

export function createControls(o: ControlsOptions): Controls {
  const { host, player, total } = o
  host.replaceChildren()

  const row = document.createElement('div')
  row.className = 'row'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Play'
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = String(total - 1)
  range.step = '1'
  range.value = '0'
  range.setAttribute('aria-label', 'Frame')
  const counter = document.createElement('span')
  counter.className = 'frame'
  row.append(button, range, counter)

  const picker = document.createElement('div')
  picker.className = 'picker'
  picker.setAttribute('role', 'group')
  picker.setAttribute('aria-label', 'Jump to date')
  const items = pickerItems(o.spec, o.dates, o.events)
  const itemEls = items.map((item) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = item.event ? `${item.label} · ${item.event}` : item.label
    if (item.event) b.className = 'event'
    b.addEventListener('click', () => {
      player.seek(item.frame)
      o.onUserAction()
    })
    picker.appendChild(b)
    return b
  })
  host.append(row, picker)

  function toggle(): void {
    if (player.state() === 'playing') player.pause()
    else player.play()
    o.onUserAction()
  }
  button.addEventListener('click', toggle)
  range.addEventListener('input', () => {
    player.seek(Number(range.value))
    o.onUserAction()
  })
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON') && e.key === ' ') return // let focused widgets keep their own space handling
    const action = keyAction(e.key)
    if (!action) return
    e.preventDefault()
    if (action === 'toggle') toggle()
    else {
      player.pause()
      const n = player.current() + (action === 'next' ? 1 : -1)
      player.seek(((n % total) + total) % total)
      o.onUserAction()
    }
  }
  document.addEventListener('keydown', onKey)

  return {
    sync(n, state) {
      button.textContent = state === 'playing' ? 'Pause' : 'Play'
      if (document.activeElement !== range) range.value = String(n)
      counter.textContent = `${n + 1} / ${total}`
      // The picker shows the date whose segment contains n.
      let current = 0
      items.forEach((item, i) => {
        if (item.frame <= n) current = i
      })
      itemEls.forEach((el, i) => el.setAttribute('aria-pressed', String(i === current)))
    },
    dispose() {
      document.removeEventListener('keydown', onKey)
      host.replaceChildren()
    },
  }
}
