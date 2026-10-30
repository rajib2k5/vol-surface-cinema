/**
 * SSVI (Gatheral and Jacquier 2014): total variance w(k, theta) =
 *   theta / 2 * (1 + rho * phi * k + sqrt((phi * k + rho)^2 + 1 - rho^2)),
 * with the power-law-like phi(theta) = eta * theta^-1/2 * (1 + theta)^-1/2 (gamma = 1/2).
 * Closed-form first and second derivatives in k, for the arbitrage checks.
 *
 * Pure.
 */

export interface SsviParams {
  /** ATM total variance at this expiry. */
  theta: number
  rho: number
  eta: number
}

/** w and its first and second derivative in log-moneyness k. */
export interface Slice {
  w: number
  w1: number
  w2: number
}

/** phi(theta) = eta * theta^-1/2 * (1 + theta)^-1/2. */
export function phi(theta: number, eta: number): number {
  return eta / (Math.sqrt(theta) * Math.sqrt(1 + theta))
}

export function ssviW(k: number, p: SsviParams): number {
  const f = phi(p.theta, p.eta)
  const u = f * k + p.rho
  return (p.theta / 2) * (1 + p.rho * f * k + Math.sqrt(u * u + 1 - p.rho * p.rho))
}

/**
 * With u = phi*k + rho and s = sqrt(u^2 + 1 - rho^2):
 *   w'  = theta*phi/2 * (rho + u/s)
 *   w'' = theta*phi^2/2 * (1 - rho^2) / s^3      (d(u/s)/du = (1 - rho^2)/s^3)
 */
export function ssviSlice(k: number, p: SsviParams): Slice {
  const f = phi(p.theta, p.eta)
  const u = f * k + p.rho
  const s = Math.sqrt(u * u + 1 - p.rho * p.rho)
  return {
    w: (p.theta / 2) * (1 + p.rho * f * k + s),
    w1: ((p.theta * f) / 2) * (p.rho + u / s),
    w2: ((p.theta * f * f) / 2) * ((1 - p.rho * p.rho) / (s * s * s)),
  }
}

/**
 * lim w(k)/k as k -> +inf, which is theta * phi * (1 + rho) / 2. Gatheral and Jacquier's Lemma 2.2 needs
 * d+(k) -> -inf as k -> +inf as well as g >= 0. For SSVI that holds when this slope is below 2.
 */
export function ssviRightWingSlope(p: SsviParams): number {
  return (p.theta * phi(p.theta, p.eta) * (1 + p.rho)) / 2
}
