/**
 * The regime story as plain data, and the pure function that turns it into per-date SSVI parameters.
 *
 * Each date t has one SSVI surface: (rho_t, eta_t) constant across T, and the ATM term structure
 *   theta_t(T_m) = sum over expiries up to m of  v_t(segment) * dT  (+ FOMC event variance).
 * Forward variance v_t > 0 makes theta increase in T by construction (GJ Thm 4.1 condition on theta).
 * eta_t is clamped so eta * (1 + |rho|) <= 2 - 1e-3 (GJ Thm 4.2 sufficient condition).
 *
 * Pure: no clock, no Math.random. All randomness comes from mulberry32(seed).
 */
import { gaussian, mulberry32 } from './prng.ts'

export interface StoryEvent {
  dateIndex: number
  label: string
  kind: 'shock' | 'policy' | 'recovery' | 'note'
}

export interface Story {
  id: string
  title: string
  badge: string
  start: string
  nDates: number
  seed: number
  grid: { k: number[]; dte: number[] }
  /** Calm base forward variance: v(T) = vInf - (vInf - v0) * exp(-T / tau), with AR(1) log jitter that fades with T. */
  base: { v0: number; vInf: number; tau: number; jitterPhi: number; jitterSigma: number; jitterFadeT: number }
  /** Smile parameters: calm values, and the values the shock pushes toward. */
  rho0: number
  rhoShock: number
  eta0: number
  etaShock: number
  /** v_t(T) += A * exp(-(t - t_j) / tauDays) * exp(-T / tauT) for t >= t_j. */
  shocks: { dateIndex: number; A: number; tauDays: number; tauT: number }[]
  /** Event variance J added to theta for expiries after the meeting, on dates before it. 252 trading days a year. */
  fomc: { dateIndex: number; J: number }
  events: StoryEvent[]
  playback: { fps: number; hold_s: number; transition_s: number; easing: 'linear' | 'smoothstep' | 'easeInOutCubic'; loop: boolean }
}

const K = Array.from({ length: 26 }, (_, j) => Math.round((-0.3 + 0.02 * j) * 100) / 100)

export const STORY: Story = {
  id: 'synthetic-regime-story',
  title: 'Synthetic regime story: calm, spike, FOMC, recovery',
  badge: 'Synthetic data (SSVI), not market data. Dates are fictional.',
  start: '2030-01-02',
  nDates: 60,
  seed: 20301,
  grid: { k: K, dte: [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365] },
  base: { v0: 0.0225, vInf: 0.035, tau: 0.8, jitterPhi: 0.8, jitterSigma: 0.05, jitterFadeT: 0.5 },
  rho0: -0.55,
  rhoShock: -0.85,
  eta0: 0.6,
  etaShock: 0.8,
  shocks: [{ dateIndex: 20, A: 0.2, tauDays: 8, tauT: 0.25 }],
  fomc: { dateIndex: 36, J: 0.0005 },
  events: [
    { dateIndex: 20, label: 'Volatility spike', kind: 'shock' },
    { dateIndex: 36, label: 'FOMC decision', kind: 'policy' },
    { dateIndex: 48, label: 'Recovery', kind: 'recovery' },
  ],
  playback: { fps: 30, hold_s: 0, transition_s: 0.2, easing: 'smoothstep', loop: true },
}

/** n weekday dates (YYYY-MM-DD) starting at `start`, which must itself be a weekday. */
export function businessDates(start: string, n: number): string[] {
  const out: string[] = []
  const d = new Date(`${start}T00:00:00Z`)
  while (out.length < n) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export interface DateParams {
  date: string
  rho: number
  eta: number
  /** theta_t(T_m) per grid expiry. */
  theta: number[]
}

const V_MIN = 0.01
const BUSINESS_DAYS_PER_YEAR = 252

export function buildDateParams(story: Story): DateParams[] {
  const dates = businessDates(story.start, story.nDates)
  const T = story.grid.dte.map((d) => d / 365)
  const rng = mulberry32(story.seed)
  const b = story.base
  const out: DateParams[] = []
  let x = 0
  for (let t = 0; t < story.nDates; t++) {
    x = b.jitterPhi * x + b.jitterSigma * gaussian(rng)

    // Shock weights at this date, and the smile parameters they move.
    let shockSum = 0
    for (const s of story.shocks) if (t >= s.dateIndex) shockSum += Math.exp(-(t - s.dateIndex) / s.tauDays)
    const s = Math.min(1, shockSum)
    const rho = story.rho0 + (story.rhoShock - story.rho0) * s
    let eta = story.eta0 + (story.etaShock - story.eta0) * s
    eta = Math.min(eta, (2 - 1e-3) / (1 + Math.abs(rho)))

    // theta_t(T_m) as the running sum of forward variance times segment length.
    const theta: number[] = []
    let acc = 0
    let prevT = 0
    for (let m = 0; m < T.length; m++) {
      const mid = (prevT + T[m]) / 2
      let v = b.vInf - (b.vInf - b.v0) * Math.exp(-mid / b.tau)
      v *= Math.exp(x * Math.exp(-mid / b.jitterFadeT))
      for (const sh of story.shocks) if (t >= sh.dateIndex) v += sh.A * Math.exp(-(t - sh.dateIndex) / sh.tauDays) * Math.exp(-mid / sh.tauT)
      if (!(v >= V_MIN)) throw new RangeError(`forward variance ${v} below minimum ${V_MIN} at date ${t}, expiry ${m}`)
      acc += v * (T[m] - prevT)
      prevT = T[m]
      // FOMC event variance: before the meeting, expiries that straddle it carry the extra variance.
      const toMeeting = (story.fomc.dateIndex - t) / BUSINESS_DAYS_PER_YEAR
      theta.push(acc + (t < story.fomc.dateIndex && T[m] >= toMeeting ? story.fomc.J : 0))
    }
    out.push({ date: dates[t], rho, eta, theta })
  }
  return out
}
