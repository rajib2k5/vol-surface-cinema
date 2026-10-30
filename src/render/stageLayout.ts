/**
 * The header band of the stage. The badge, date caption, extrapolation note and event pill live in the
 * band, and the 3D view (or the heatmap) gets only the area below it. So no overlay text can sit on an
 * axis label, whatever the size. The band height is fixed per width class, so it never changes
 * from frame to frame. The CSS in style.css lays out the band from data-size.
 */
export type StageSize = 'lg' | 'md' | 'sm'

export interface StageLayout {
  size: StageSize
  /** Height of the header band in CSS pixels. */
  head: number
}

export function stageLayout(width: number): StageLayout {
  if (width >= 1000) return { size: 'lg', head: 84 }
  if (width >= 600) return { size: 'md', head: 74 }
  return { size: 'sm', head: 96 }
}

/** The size of the area below the band, never below 1 px so a tiny stage cannot give a zero-size canvas. */
export function plotSize(width: number, height: number): { width: number; height: number } {
  return { width, height: Math.max(1, height - stageLayout(width).head) }
}

/** Write the layout on the stage for the CSS (data-size and --head-h). */
export function applyStageLayout(stage: HTMLElement, width: number): void {
  const l = stageLayout(width)
  stage.dataset.size = l.size
  stage.style.setProperty('--head-h', `${l.head}px`)
}
