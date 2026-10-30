// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT.
/** Shared numeric formatting for consistent tabular display. */
export function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function pct(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(dp)}%`
}
