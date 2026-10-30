# Claims ledger: surface maths (evidence-gated validation)

Pre-registered 2026-10-29, before either audit channel ran. Mode 1 (two independent subagents).
Environment pin: [env-pin.txt](env-pin.txt). Code under audit (at commit `b623e55` on `feat/v0.1`):
`src/synth/ssvi.ts`, `src/synth/arbitrage.ts`, `src/synth/story.ts`, `src/synth/generate.ts`,
`src/lib/interpolate.ts`, `src/lib/easing.ts`, and the committed `public/data/synthetic-regime-story.json`.

Every material claim starts REJECTED. Neither channel may add, drop or reword a claim.

| ID | Cat | Mat | Claim |
|---|---|---|---|
| C1 | Algorithmic | material | `ssviW(k, p)` computes the SSVI total variance of Gatheral and Jacquier (2014), `w(k, θ) = θ/2 · (1 + ρφ(θ)k + sqrt((φ(θ)k + ρ)² + 1 − ρ²))`. |
| C2 | Algorithmic | material | `phi(θ, η)` is the paper's power-law-type function `φ(θ) = η / (θ^γ (1+θ)^(1−γ))` with γ = 1/2. |
| C3 | Numeric | material | `ssviSlice` returns the exact first and second derivatives of `ssviW` in k (`w1`, `w2`). |
| C4 | Algorithmic | material | `butterflyG` computes the density function `g(k) = (1 − k w'/(2w))² − (w'²/4)(1/w + 1/4) + w''/2`, whose non-negativity over all k is the butterfly no-arbitrage condition used in the paper. |
| C5 | Algorithmic | material | For this φ with γ = 1/2, `η(1 + |ρ|) ≤ 2` is a sufficient condition for an SSVI surface free of butterfly arbitrage. |
| C6 | Algorithmic | material | For this φ, an SSVI surface with constant ρ ∈ (−1, 1) and θ(T) non-decreasing in T is free of calendar spread arbitrage. |
| C7 | Numeric | material | For every one of the 60 story dates, `buildDateParams` gives θ strictly increasing over the 11 grid expiries, θ > 0, `|ρ| < 1`, and `η(1 + |ρ|) ≤ 2`. |
| C8 | Algorithmic | material | If two surfaces on a common T grid each have total variance non-decreasing in T at every k, then `(1 − α)wA + αwB` is non-decreasing in T at every k for every α ∈ [0, 1]. |
| C9 | Semantic | material | `interpolateIv(wg, i, j, α, out)` fills `out[r][c]` with `sqrt(((1 − α) wA + α wB) / T_r)`, where `w = iv² · dte/365` from the frames' IV grids, and returns frame i's IVs unchanged at α = 0. |
| C10 | Numeric | material | Every committed date, and every in-between surface `(1 − α)wA + αwB` for α ∈ {0, 0.01, …, 1} over every adjacent date pair and the wrap pair (date 59 → date 0), has min g ≥ 0 for k ∈ [−1.5, 1.5] and total variance non-decreasing in T at every grid expiry. |
| C11 | Numeric | material | Every IV in the committed `synthetic-regime-story.json` is within 5e-7 of the unrounded analytic `sqrt(w(k, θ_t(T)) / T)` with `T = dte/365`, and the committed grid is non-decreasing in `w = iv² · dte/365` along T at every k on every date. |
| C12 | Numeric | material | The butterfly check can fail: the control ρ = −0.8, η = 5/1.8, θ = 0.02 gives min g < 0 on k ∈ [−1.5, 1.5]. |
| C13 | Semantic | material | `ease(kind, x)` is non-decreasing on [0, 1] with `ease(0) = 0` and `ease(1) = 1` for each of `linear`, `smoothstep` and `easeInOutCubic`, so an eased α stays in [0, 1]. |
| C14 | Semantic | minor | `mixSlices` applies the same convex weights to `w`, `w1` and `w2`, which equals the derivatives of the mixed slice. |
