/**
 * The DOM overlays on the stage: badge, date caption, event pills. Everything goes in through
 * textContent (labels come from data). Opacity is set per frame from the frame index; there are no
 * CSS transitions anywhere, so a headless screenshot of frame n always matches the live frame n.
 */
export interface Overlay {
  set(caption: string, pills: readonly { index: number; opacity: number }[], note?: string | null): void
  /** Resolves when fonts are ready (a system stack today, so this is immediate). */
  ready: Promise<void>
  dispose(): void
}

export interface PillSpec {
  label: string
  kind?: string
}

export function createOverlay(stage: HTMLElement, badge: string, pills: readonly PillSpec[]): Overlay {
  const root = document.createElement('div')
  root.className = 'overlay'

  const badgeEl = document.createElement('div')
  badgeEl.className = 'badge'
  badgeEl.textContent = badge

  const captionEl = document.createElement('div')
  captionEl.className = 'caption'
  captionEl.setAttribute('aria-live', 'off')

  const noteEl = document.createElement('div')
  noteEl.className = 'extrap-note'

  const pillBox = document.createElement('div')
  pillBox.className = 'pills'
  const pillEls = pills.map((p) => {
    const el = document.createElement('div')
    el.className = `pill ${/^[a-z]+$/.test(p.kind ?? '') ? p.kind : ''}`.trim()
    el.textContent = p.label
    el.style.display = 'none'
    pillBox.appendChild(el)
    return el
  })

  root.append(badgeEl, captionEl, noteEl, pillBox)
  stage.appendChild(root)

  let lastCaption = ''
  let lastNote = ''
  return {
    set(caption, active, note) {
      if (caption !== lastCaption) {
        captionEl.textContent = caption
        lastCaption = caption
      }
      const noteText = note ?? ''
      if (noteText !== lastNote) {
        noteEl.textContent = noteText
        lastNote = noteText
      }
      const opacity = new Map(active.map((a) => [a.index, a.opacity]))
      pillEls.forEach((el, i) => {
        const o = opacity.get(i)
        if (o === undefined) el.style.display = 'none'
        else {
          el.style.display = ''
          el.style.opacity = String(o)
        }
      })
    },
    ready: document.fonts?.ready.then(() => undefined) ?? Promise.resolve(),
    dispose() {
      root.remove()
    },
  }
}
