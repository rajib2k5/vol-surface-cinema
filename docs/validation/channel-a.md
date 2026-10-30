# Channel A: documentation audit (surface maths)

Auditor: Channel A (documentation only). Mode 1. Retrieved and written 2026-10-29.
No code, probe or numeric computation was executed. Hand algebra is shown where it decides a claim.
Inputs read: `src/synth/{ssvi,arbitrage,story,generate}.ts`, `src/lib/{interpolate,easing}.ts`,
`docs/validation/env-pin.txt`, `docs/validation/claims-ledger.md`. Nothing else in the repo was read.
(`src/synth/prng.ts`, `src/lib/contract.ts` and `public/data/synthetic-regime-story.json` were not read.)

## Primary sources

| Tag | Source | Version | Retrieved |
|---|---|---|---|
| GJ | J. Gatheral, A. Jacquier, "Arbitrage-free SVI volatility surfaces", https://arxiv.org/abs/1204.0646 (PDF https://arxiv.org/pdf/1204.0646) | arXiv v4, 21 Mar 2013 (the version the abstract page serves; published as Quant. Finance 14(1), 2014) | 2026-10-29 |
| ES | ECMAScript 2024 Language Specification (ECMA-262 15th ed.), https://262.ecma-international.org/15.0/ | ES2024, the edition matching Node v22.23.1 in `env-pin.txt` | 2026-10-29 |

Gatheral 2004/2006 was not needed: GJ eq. (2.1) and Lemma 2.2 define g(k) and the butterfly condition directly.
Section, equation and theorem numbers below are those of GJ v4.

## Verdict table

| ID | Verdict | Decided by |
|---|---|---|
| C1 | CONFIRMED | GJ Def. 4.1, eq. (4.1) |
| C2 | CONFIRMED | GJ Remark 4.4, eq. (4.5), with γ = 1/2 |
| C3 | CONFIRMED | Hand differentiation (shown below) |
| C4 | REFUTED (the second half). The formula half is confirmed. | GJ eq. (2.1), Lemma 2.2 |
| C5 | CONFIRMED | GJ Thm 4.2, with conditions 1 and 2 checked by hand for γ = 1/2; Remark 4.4 |
| C6 | CONFIRMED | GJ Thm 4.1, with condition 2 checked by hand; Example 4.2 |
| C7 | UNVERIFIABLE. Each of the four properties follows by hand, but only if `buildDateParams` returns without throwing for seed 20301. | Code reading + hand algebra; no document decides the RNG-dependent part |
| C8 | CONFIRMED | Hand algebra (also holds in IEEE arithmetic, ES §6.1.6.1) |
| C9 | CONFIRMED (one caveat about the `i === j` path) | Code reading |
| C10 | UNVERIFIABLE. Theorems cover the calendar part and the g ≥ 0 part at the dates themselves (in exact arithmetic). No theorem covers butterfly-freeness of the in-between mixtures. | GJ Thm 4.1, 4.2 + C8; nothing for mixtures |
| C11 | UNVERIFIABLE | Numeric claim about committed data (ES §21.3.2.28 bounds only the ideal rounding error) |
| C12 | UNVERIFIABLE. GJ shows the control violates the sufficient condition, but no theorem implies g < 0 on [−1.5, 1.5]. | GJ Thm 4.2 (sufficient only), Lemma 4.2 (not triggered at θ = 0.02) |
| C13 | UNVERIFIABLE. The real-arithmetic statement is confirmed and the FP endpoints are exact by the spec, but the FP monotonicity/range of `smoothstep` and `easeInOutCubic` is not guaranteed by the spec. | Hand calculus; ES §6.1.6.1.3 (`**` is implementation-approximated) |
| C14 | CONFIRMED | Linearity of differentiation |

## Per-claim evidence

### C1: CONFIRMED
- source: GJ, Section 4, Definition 4.1, eq. (4.1). Tier 4 (original paper).
- quote (text extraction of eq. 4.1): "w(k, θt) = θt/2 (1 + ρϕ(θt)k + √((ϕ(θt)k + ρ)² + (1 − ρ²)))"
- retrieved: 2026-10-29
- reasoning: `ssviW` (ssvi.ts:29–33) computes `(theta/2) * (1 + rho*f*k + sqrt(u*u + 1 - rho*rho))` with `u = f*k + rho` and `f = phi(theta, eta)`. This is term-for-term eq. (4.1). Def. 4.1 also requires ϕ to be "a smooth function from R∗+ to R∗+" such that lim θϕ(θ) exists. For the C2 φ with η > 0: θφ(θ) = η√(θ/(1+θ)) → 0 as θ → 0, so the requirement holds. The paper's analysis assumes |ρ| < 1. The code reaches that value range only through C7.

### C2: CONFIRMED
- source: GJ, Remark 4.4, eq. (4.5). Tier 4.
- quote: "ϕ(θ) = η / (θ^γ (1 + θ)^(1−γ))   (4.5)"
- retrieved: 2026-10-29
- reasoning: with γ = 1/2, (4.5) is η / (θ^{1/2}(1+θ)^{1/2}). `phi` (ssvi.ts:25–27) returns `eta / (Math.sqrt(theta) * Math.sqrt(1 + theta))`, which is algebraically identical. (ES §21.3.2.32: `Math.sqrt` returns an "implementation-approximated" value. The match is therefore exact in real arithmetic, and the computed value is approximate to within the engine's sqrt error.)

### C3: CONFIRMED (hand derivation)
- source: hand differentiation of eq. (4.1) at fixed θ, ρ, φ. No document is needed.
- retrieved: n/a
- derivation: let u = φk + ρ and s = √(u² + 1 − ρ²), so du/dk = φ and ds/dk = φu/s.
  - w = θ/2 (1 + ρφk + s) ⇒ w′ = θ/2 (ρφ + φu/s) = (θφ/2)(ρ + u/s). This matches `w1` (ssvi.ts:46).
  - d(u/s)/du = (s − u·u/s)/s² = (s² − u²)/s³ = (1 − ρ²)/s³ ⇒ w″ = (θφ/2)·φ·(1 − ρ²)/s³ = (θφ²/2)(1 − ρ²)/s³. This matches `w2` (ssvi.ts:47).
  - `w` in `ssviSlice` is the same expression as `ssviW`.
  The derivatives are exact closed forms. Their FP evaluation is subject to rounding and to the implementation-approximated `Math.sqrt` (ES §21.3.2.32).

### C4: REFUTED (as worded). The formula half is CONFIRMED.
- source: GJ, Section 2.2, eq. (2.1) and Lemma 2.2. Tier 4.
- quote (Lemma 2.2): "A slice is free of butterfly arbitrage if and only if g(k) ≥ 0 for all k ∈ R and lim_{k→+∞} d+(k) = −∞."
- retrieved: 2026-10-29
- reasoning:
  - The formula half holds. eq. (2.1) is g(k) = (1 − k w′/(2w))² − (w′²/4)(1/w + 1/4) + w″/2. `butterflyG` (arbitrage.ts:11–14) computes `a*a - (w1*w1/4)*(1/w + 0.25) + w2/2` with `a = 1 - k*w1/(2*w)`. The two are identical.
  - The condition half does not hold. The claim says g's "non-negativity over all k is the butterfly no-arbitrage condition used in the paper". The paper's condition (Lemma 2.2) is a conjunction: g ≥ 0 on all of R **and** d+(k) = −k/√w + √w/2 → −∞ as k → +∞. g ≥ 0 alone is necessary but not sufficient. The code comment (arbitrage.ts:10, "g >= 0 for all k means no butterfly arbitrage") makes the same omission. Lemma 2.2 also assumes the slice is C²(R) ("we shall always assume that the map k ↦ w(k, t) is at least of class C²").
  - Mitigation, not a reversal: for SSVI slices that satisfy GJ Thm 4.2 condition 1, the d+ limit holds. The proof of Thm 4.2 says "this is satisfied as soon as Condition 1 in Theorem 4.2 holds", and C5 establishes condition 1 here. So the omission is harmless for the pure SSVI date slices. It is not harmless for the mixed slices of C10, for which no one has shown the d+ condition. (Remark 4.3 shows w grows like |k| for SSVI, so d+ → −∞ is plausible for the mixtures too, but that is not a cited result.)
  - Separately, the code evaluates g only on a finite k grid (C10's domain), not "over all k".

### C5: CONFIRMED
- source: GJ, Theorem 4.2. Tier 4. Corroborated by Remark 4.4.
- quote (Thm 4.2): "The SSVI volatility surface (4.1) is free of butterfly arbitrage if the following conditions are satisfied for all θ > 0: 1. θϕ(θ)(1 + |ρ|) < 4; 2. θϕ(θ)²(1 + |ρ|) ≤ 4."
- quote (Remark 4.4, after eq. 4.5): "gives a surface that is completely free of static arbitrage provided that η (1 + |ρ|) ≤ 2."
- retrieved: 2026-10-29
- hand check of the hypotheses for φ = η θ^{-1/2}(1+θ)^{-1/2}, η > 0, |ρ| < 1, assuming η(1+|ρ|) ≤ 2:
  - Condition 1 (strict): θφ = η√(θ/(1+θ)) < η for all θ > 0, so θφ(1+|ρ|) < η(1+|ρ|) ≤ 2 < 4. ✓
  - Condition 2: θφ² = η²/(1+θ) < η², so θφ²(1+|ρ|) < η²(1+|ρ|) ≤ η²(1+|ρ|)² ≤ 4. ✓
  - The d+ requirement of Lemma 2.2 is discharged inside the Thm 4.2 proof by condition 1.
- hypotheses to keep in mind:
  - Thm 4.2 is sufficient only ("if"). Lemma 4.2 shows condition 1 is necessary in its non-strict form.
  - The proof reduces "by symmetry" to 0 ≤ ρ < 1, so |ρ| < 1 is assumed. η > 0 is needed for ϕ: R∗+ → R∗+.
  - Butterfly-freeness is per slice. A constant ρ across T is not needed for this claim, only the same (ρ, η) inside each slice.

### C6: CONFIRMED
- source: GJ, Theorem 4.1. Tier 4. Example 4.2 corroborates.
- quote (Thm 4.1): "The SSVI surface (4.1) is free of calendar spread arbitrage if and only if 1. ∂tθt ≥ 0, for all t ≥ 0; 2. 0 ≤ ∂θ(θϕ(θ)) ≤ (1/ρ²)(1 + √(1 − ρ²)) ϕ(θ), for all θ > 0, where the upper bound is infinite when ρ = 0."
- retrieved: 2026-10-29
- hand check of condition 2 for the C2 φ: θφ = η θ^{1/2}(1+θ)^{-1/2}, so
  ∂θ(θφ) = (η/2)[θ^{-1/2}(1+θ)^{-1/2} − θ^{1/2}(1+θ)^{-3/2}] = (η/2) θ^{-1/2}(1+θ)^{-3/2} > 0.
  Hence ∂θ(θφ)/φ = 1/(2(1+θ)) ∈ (0, 1/2). The upper-bound factor (1 + √(1−ρ²))/ρ² is ≥ 1 for 0 < |ρ| ≤ 1: the numerator is ≥ 1 and the denominator is ≤ 1, and GJ Example 4.1 states it "is greater than one for any ρ ∈ [−1, 1]". So condition 2 holds for every θ > 0. Condition 1 is exactly "θ non-decreasing in T", which is non-strict and matches the claim.
- hypotheses:
  - ρ constant in t is built into Definition 4.1. The proof uses ∂t w(k, θt) = ∂θ w(k, θt) ∂t θt, which needs ρ and ϕ to depend on t only through θ. The code satisfies this per date: (ρ, η) are fixed across T (story.ts:104–106).
  - GJ assume θ ∈ C¹ with θ0 = 0. The code has θ only at 11 grid expiries. The proof shows ∂θ w(k, θ) ≥ 0 for all θ > 0, so w(k, ·) is non-decreasing in θ, and a non-decreasing θ on the grid then gives non-decreasing w on the grid.
  - GJ Lemma 2.1 (calendar ⇔ ∂t w ≥ 0) assumes proportional dividends. Definition 2.2 instead takes ∂t w ≥ 0 as the definition.

### C7: UNVERIFIABLE (partial hand proof)
- source: code reading (story.ts:90–127) + hand algebra. No document decides the RNG-dependent part.
- What hand reasoning establishes, given that `buildDateParams` returns:
  - |ρ| < 1. shockSum ≥ 0, so s = min(1, shockSum) ∈ [0, 1], and ρ = −0.55 + (−0.85 + 0.55)s ∈ [−0.85, −0.55]. So |ρ| ≤ 0.85 < 1.
  - η(1+|ρ|) ≤ 2. η = min(η_raw, (2 − 1e-3)/(1+|ρ|)), so η(1+|ρ|) ≤ 1.999 up to a few ulps of rounding, which is far below the 1e-3 margin. (η_raw ∈ [0.6, 0.8] and 0.8 × 1.85 = 1.48, so the clamp never binds.) η > 0.
  - θ > 0 and strictly increasing over the 11 expiries. The guard `if (!(v >= V_MIN)) throw` means every surviving v ≥ 0.01. The dte values are strictly increasing, so T[m] − T[m−1] > 0 (`d/365` is correctly rounded and monotone, ES §6.1.6.1.5). So acc increases by at least 0.01·ΔT ≥ 0.01·7/365 at every step. The FOMC term J·[T[m] ≥ toMeeting] is non-decreasing in m, because T[m] increases and toMeeting is fixed per date, and J = 0.0005 > 0. θ_0 = v·7/365 (+J) > 0. (FP absorption of an increment ≥ 1.9e-4 into acc would need acc ≳ 1e12, which v and ΔT cannot reach unless v is astronomically large. That is a hand bound, not a proof over the unknown draws.)
- What is not decided: whether the call returns at all for seed 20301, that is, whether v ≥ 0.01 at all 60 × 11 points. The base term is ≥ v0 = 0.0225 (because vInf > v0), but it is multiplied by exp(x·e^{−mid/0.5}). x is an AR(1) path driven by `gaussian(mulberry32(20301))` from `prng.ts`, which was not among my inputs. Violation needs x·fade < ln(0.01/0.0225) ≈ −0.81. That depends on the actual draws, which is Channel B territory.

### C8: CONFIRMED (hand algebra)
- source: elementary algebra. Calendar arbitrage = w non-decreasing in T (GJ Def. 2.2: "∂t w(k, t) ≥ 0, for all k ∈ R and t > 0").
- derivation: fix k and T1 < T2 with wA(T1) ≤ wA(T2) and wB(T1) ≤ wB(T2). For α ∈ [0, 1], both 1 − α ≥ 0 and α ≥ 0, so (1−α)wA(T1) + αwB(T1) ≤ (1−α)wA(T2) + αwB(T2). ∎
- FP note (beyond the claim): ES §6.1.6.1.4/§6.1.6.1.7 say multiplication and addition are performed "according to the rules of IEEE 754-2019 binary double-precision arithmetic" (round-to-nearest-even, §6.1.6.1). Correct rounding is monotone, β = fl(1 − α) ≥ 0 for α ∈ [0, 1], and fl(β·a) and fl(x + y) are monotone in each argument. So the computed mixture is also non-decreasing (non-strictly). This does not imply butterfly-freeness of the mixture (see C10).

### C9: CONFIRMED (caveat)
- source: code reading (interpolate.ts:22–61).
- reasoning:
  - `precomputeW` stores `iv**2 * T[i]` with `T = dte/365`, which is w = iv²·dte/365.
  - For i ≠ j and α ∈ (0, 1], `row[c] = Math.sqrt((beta*a[k] + alpha*b[k]) / T[r])` with `beta = 1 - alpha` and `k = r*nK + c`. a and b are frames i and j at the same (r, c). That is the claimed sqrt(((1−α)wA + αwB)/T_r).
  - At α = 0 the early branch (line 45) copies `wg.iv[i][r][c]` verbatim, so frame i's IVs come back unchanged, with no sqrt round trip.
- caveat (minor): when `i === j` and α > 0, the code also returns `iv[i]` verbatim instead of evaluating sqrt(w_i/T). This is mathematically equal for iv ≥ 0, but it can differ from the formula's FP value by rounding (`**` and `Math.sqrt` are implementation-approximated, ES §6.1.6.1.3, §21.3.2.32). Out-of-range α or indices throw rather than fill.

### C10: UNVERIFIABLE (theorem coverage is partial)
- What theorems cover (exact arithmetic, analytic SSVI slices, given C7's properties):
  - Each committed date has g ≥ 0 for all k: GJ Thm 4.2 via C5. The k ∈ [−1.5, 1.5] restriction is a subset.
  - Each committed date is calendar-monotone at every k: GJ Thm 4.1 via C6.
  - Every in-between mixture is calendar-monotone at every k: C8 applied to two calendar-monotone endpoints. The wrap pair is just another pair.
- What no theorem covers: min g ≥ 0 for the in-between surfaces (1−α)wA + αwB. g is nonlinear in (w, w′, w″) (eq. 2.1), and a convex combination of two SSVI slices with different (θ, ρ, η) is not itself an SSVI slice. GJ gives no result that butterfly-freeness survives total-variance mixing; Thm 4.3 adds an increasing function of t, which is a different construction. Also unproven for mixtures: the d+ condition of Lemma 2.2 (see C4).
- The statement is also about specific numeric data at an FP grid of α values. Whether "committed date" means the SSVI parameters or the rounded IV file is a reading not fixed by documents. That is Channel B territory.

### C11: UNVERIFIABLE
- source: code reading (generate.ts:21, 34) + ES §21.3.2.28 (Math.round).
- quote (ES §21.3.2.28): "returns the Number value that is closest to x and is integral."
- reasoning: in ideal arithmetic, round6(x) = Math.round(x·1e6)/1e6 is within 5e-7 of x. In FP, the product x·1e6 and the division by 1e6 each add rounding of order 1e-16 relative, so a value sitting at a tie could exceed 5e-7 by about 1e-16. Whether any committed value does is a data question. The claim also needs the committed JSON to equal `generate()` output and the rounded grid to stay w-monotone in T. Rounding can reorder close neighbours, and no theorem bounds that. The JSON was not among my inputs, and deciding this would need computation.

### C12: UNVERIFIABLE
- source: GJ Thm 4.2 and Lemma 4.2. Tier 4.
- quote (Lemma 4.2): "free of butterfly arbitrage only if θϕ(θ)(1 + |ρ|) ≤ 4, for all θ > 0. Moreover if θϕ(θ)(1 + |ρ|) = 4, the SSVI surface is free of butterfly arbitrage only if θϕ(θ)²(1 + |ρ|) ≤ 4."
- reasoning (hand arithmetic, not deciding):
  - The control has η(1+|ρ|) = (5/1.8)(1.8) = 5 > 2, so it violates the C5 sufficient condition.
  - At θ = 0.02, condition 2 of Thm 4.2 fails: θφ²(1+|ρ|) = η²(1.8)/1.02 ≫ 4. But Thm 4.2 is sufficient only, so failure does not imply g < 0.
  - Lemma 4.2's necessary condition is not violated at this slice: θφ(1+|ρ|) = (5/1.8)√(0.02/1.02)·1.8 ≈ 0.7 < 4. Its second clause applies only at equality (= 4). The Lemma 4.2 asymptotic leading terms (16 − θ²ϕ²(1±ρ)²)/64 are positive here, so any negativity must be interior.
  - No theorem therefore implies min g < 0 on [−1.5, 1.5]. Deciding it requires evaluating g, which is Channel B.

### C13: UNVERIFIABLE (the real-arithmetic part is confirmed, and the endpoints are exact)
- source: hand calculus + ES §6.1.6.1.3 (Number::exponentiate), §6.1.6.1.4/§6.1.6.1.7.
- quote (ES §6.1.6.1.3): "It returns an implementation-approximated value representing the result of raising base to the exponent power."
- real arithmetic (CONFIRMED):
  - linear: trivial.
  - smoothstep x²(3−2x): derivative 6x(1−x) ≥ 0 on [0, 1]; values 0 and 1 at the endpoints.
  - easeInOutCubic: 4x³ on [0, ½) has derivative 12x² ≥ 0. 1 − (2−2x)³/2 on [½, 1] has derivative 3(2−2x)² ≥ 0. Both pieces equal ½ at x = ½, so the function is continuous and therefore monotone, with value 0 at x = 0 and 1 at x = 1.
- FP endpoints (CONFIRMED from the spec):
  - ease(·, 0): 4·0·0·0 = +0 and 0·0·3 = 0.
  - easeInOutCubic(1): −2·1 + 2 = +0 (Number::add of equal-magnitude opposite signs gives +0 under roundTiesToEven), then ES §6.1.6.1.3 step 6a says "If base is +0𝔽 … If exponent > +0𝔽, return +0𝔽". So 1 − 0/2 = 1.
  - smoothstep(1) = 1·1·1 = 1.
- Not decided: FP monotonicity and the FP range [0, 1].
  - For easeInOutCubic, `y ** 3` with y ∈ [0, 1] is implementation-approximated, so the spec guarantees neither monotonicity in y nor y³ ≤ 1. (−2x + 2 itself is exact for x ∈ [½, 1] by Sterbenz.)
  - For smoothstep, fl(x·x)·fl(3 − 2x) multiplies an increasing factor by a decreasing one, so monotone rounding does not give a composition proof.
  - In this code, an out-of-range eased α would make `interpolateIv` throw. The FP part needs Channel B.

### C14: CONFIRMED (minor)
- source: linearity of differentiation. Code: arbitrage.ts:39–48.
- reasoning: with constant weights β = 1 − α and α, d/dk[βwA + αwB] = βwA′ + αwB′ and d²/dk² = βwA″ + αwB″. `mixSlices` applies the same `beta` and `alpha` to `w`, `w1` and `w2` elementwise. Caveat: this is valid only when `a` and `b` were sampled on the same k grid. `mixSlices` does not check that; it matches by index.
