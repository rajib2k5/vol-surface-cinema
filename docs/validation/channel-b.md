# Channel B: runtime audit (empirical only)

Auditor: Channel B subagent, 2026-10-29. Mode 1 (independent). The audit used no documentation, papers, design docs, ADRs,
commit messages, repo tests or other validation files. Each verdict rests on probes that this channel wrote and ran.

- Toolchain: node v22.23.1 (runs `.ts` directly), per [env-pin.txt](env-pin.txt).
- Probes and helpers: `/tmp/claude-1000/-home-rajib2k5-dev-vol-surface-cinema/fb5be934-2477-4222-9096-84f0b85277c9/scratchpad/channel-b/`
  (`p_c*.mjs`, `lib.mjs`, `run.sh`, `mut.sh`). Abbreviated below as `$S`. `$R` = `/home/rajib2k5/dev/vol-surface-cinema/src`.
- Sandbox (`run.sh`): `env -i` (PATH, HOME/TMPDIR = fresh mktemp dir, LC_ALL=C, TZ=UTC, ROOT), `timeout -k 5 300`,
  `unshare --user --map-root-user --net`, `ulimit -t 290 -f 204800 -u 256 -c 0`. Self-tests: `selftest.mjs` (imports
  `ssvi.ts` in the sandbox) rc=0, and `nonet.mjs` printed `net error ENETUNREACH`.
- Independent numerics (`lib.mjs`, no repo code): erfc from a positive series (z<3) or a Lentz continued fraction;
  Black prices with forward 1; numerical density ∂²P/∂K² from out-of-the-money prices. Self-test `libtest.mjs` gave rc=0.
  Φ(1), Φ(−3), Φ(−6) and Φ(2.5) had relative error ≤ 3.5e-14. A flat-vol density integrated to 1.0000001667.
- Mutation harness (`mut.sh NAME FILE SED`): copies `src/` to `$S/mut/NAME/src`, applies one sed mutation, prints the diff,
  and refuses a mutation that does not apply. Each probe takes the module root from `ROOT`, so the same probe runs on the original and on the mutant.
- Repo integrity: `sha256sum -c` on all 9 audited files after all runs gave `OK` for each. No repo file other than this one was written.

## Verdict table

| ID | Verdict | Key evidence (original run) | Falsifier (mutation → rc) |
|---|---|---|---|
| C1 | CONFIRMED (stated expression). Attribution to GJ 2014: UNVERIFIABLE (Channel B) | 200k random draws: ssviW = the ledger expression to rel 0; w(0)=θ; w(k,ρ)=w(−k,−ρ); wing slopes θφ(1±ρ)/2 to 1e-7 | `u = f*k - p.rho` → 1 |
| C2 | CONFIRMED (stated expression, γ=1/2). Attribution: UNVERIFIABLE (Channel B) | phi = η/(θ^½(1+θ)^½) rel err 0; θφ² = η²/(1+θ) to 8.9e-16 | `sqrt(1+θ)` → `(1+θ)` → 1 |
| C3 | CONFIRMED | 20k draws vs Richardson FD of ssviW: w1 err 4.3e-11, w2 err 3.6e-7 (scaled) | w2 `/s³`→`/s²` → 1; w1 `u/s`→`u*s` → 1 |
| C4 | CONFIRMED | butterflyG = density from Black-price convexity, rescaled by K√w/n(d₋): 119,548 pts, 37,131 of them negative-density, max rel err 1.05e-4, 0 sign mismatches | `+0.25`→`+0.5` → 1; `w2/2`→`w2` → 1 |
| C5 | CONFIRMED (empirical search, not a proof) | Price-convexity search: 20,000 draws with η(1+\|ρ\|)≤2 (10% exactly =2): 0 violations, min g 0.18. Above the bound: 6,601 of 20,000 draws violate (seeds 3, 101, 202, 303). Exact-g wide-k scan: 20,000 draws, 0 violations | phi→η/θ → 1 (814/1500 violations inside) |
| C6 | CONFIRMED (empirical) | 3 seeds × 4000 draws (η∈[0.01,10], no cap), k∈[−50,50]: 336M w evaluations, 0 decreases; OTM prices at fixed k, 0 decreases | phi→η/θ^1.5 → 1 |
| C7 | CONFIRMED | 60 dates × 11 θ: min θ step 4.08e-4 > 0, min θ 4.0e-4, max \|ρ\| 0.85, max η(1+\|ρ\|) 1.48 | `ρ… * s * 2` → 1 |
| C8 | CONFIRMED | 120k random convex mixes of T-monotone surfaces (through repo mixSlices): 0 violations. Negative control α<0: 20,000/20,000 violate | `beta*a + alpha*b` → `beta*a - alpha*b` → 1 |
| C9 | CONFIRMED | 1.43M cells vs √(((1−α)wA+αwB)/T) from committed JSON: max rel 3.3e-16; α=0 returns exact IVs (0 mismatches) | lerp IV → 1; drop `alpha === 0` branch → 1 |
| C10 | CONFIRMED | 61 pairs (incl. 59→0) × 101 α = 6,060 surfaces × 11 T × 6,001 k: min g 0.2596, 0 calendar violations. Black-price density cross-check: min 0.2787 | `eta = 4*min(…)` → 1; `acc +=`→`acc =` → 1 |
| C11 | CONFIRMED | 17,160 cells: max \|iv − analytic\| = 4.99997e-7 ≤ 5e-7; 0 T-monotonicity violations (min w step 2.58e-4) | IV +1e-6 in copy → 1; flattened row → 1; 252→250 days → 1 |
| C12 | CONFIRMED | control: minButterflyG = −0.10818; independent price-density min = −0.10818 at k ≈ −0.057 | `- w1²…` → `+ w1²…` → 1 |
| C13 | CONFIRMED | 2M-point grid + 1M random pairs (⅓ within 1e-9 of 0.5) per kind: 0 decreases, 0 out of [0,1], ease(0)=0, ease(1)=1 | smoothstep `3.5−2.5x` → 1; cubic `/2`→`/1.5` → 1 |
| C14 (minor) | CONFIRMED | 3000 random mixes × 21 k vs Richardson FD of the mixed ssviW: w1 err 6.2e-12, w2 err 2.1e-6 | w2 weights swapped → 1 |

No claim REFUTED.

## Probe deviations and surviving mutants (recorded, not hidden)

- **lib.mjs bug, found and fixed.** The first density helper computed puts as `call − (1−K)`. At K ≈ 1e-6 this cancellation gave
  false negative densities. The first C5 runs (seeds 101/202) reported 6 and 4 "violations" inside the bound at θ≈4.8, k≈−13.
  `dbg_c5.mjs` showed the estimate diverging as h shrank (0.42 at h=0.1, −6.9 at h=3e-4), while the exact g was 0.42.
  The helper now uses OTM prices directly, and h-convergence holds (0.42054 ± 1e-5 for h = 0.1 … 1e-3). All C4/C5/C10/C12 results above come after the fix.
- **C3:** the first run used a step that ignored the √(1−ρ²) curvature width, and w2 err was 7.1e-5, so rc=1. With the scaled step,
  w2 err is 3.6e-7. The error shrank as the step shrank, which shows finite-difference truncation and not a wrong w2.
- **C4:** the first run used h ∝ 1e-4·√w and had roundoff (worst 0.0127). I then used Richardson with hrel 5e-4/1e-3, and the tolerance went from 1e-4 to 1e-3.
  Convergence check: the same probe at 5× coarser steps gives 0.0749, and 0.0749/5⁴ ≈ 1.2e-4 matches the 1.05e-4 residual (h⁴ scaling).
  The mutants are at 0.267 and 13.6.
- **C6:** price-level checks were limited by float precision. Raw calls failed at 1e-15 (the (1−K) roundoff), and relative 1e-13 failed on subnormal tails.
  Final check: OTM prices, absolute tolerance 1e-14. The largest observed roundoff drop was 1.5e-15, while w had 0 decreases.
- **Mutants that survived (and why).**
  - `m_c7b` (FOMC condition flipped) kept θ strictly increasing, so the claim still held for it.
  - `m_c10` (η×3, so η(1+|ρ|) ≤ 4.4) still had min g = 0.008 > 0. The bound is sufficient, not necessary.
  - `m_c13` (cubic `/2.5`) only jumps upward at 0.5, so it is still monotone with the same endpoints.

  Each of these three was replaced by a mutant that actually violates the claim (listed in the table).
- **C7 note.** The η clamp in `buildDateParams` never binds for STORY: max η(1+|ρ|) is 1.48, below the 1.999 clamp.
  C7 holds without the clamp, so this audit does not exercise the clamp code.

## Per-claim records

All original runs: `./run.sh $R $S/<probe> [args]`, rc=0, after the fixes above. Wall times are from the final clean run.
Verbatim stdout is shown, with whitespace collapsed for the longer outputs.

### C1 / C2 — `p_c1c2.mjs`
```
probe_cmd: ./run.sh $R $S/p_c1c2.mjs C1   (and ... C2)     rc=0 / rc=0   wall 0.10s / 0.09s
stdout: { maxPhi: 0, maxStruct: 8.881784197001252e-16, maxW: 0, maxW0: 0, maxSym: 0, maxSlope: 1.0000005135069046e-7 }
        C1 PASS C2 PASS
falsifier C1: mut.sh m_c1 synth/ssvi.ts 's|const u = f \* k + p.rho$|const u = f * k - p.rho|'
  stdout: { ..., maxW: 454.6437710330952, maxW0: 0, maxSym: 0, maxSlope: 0.00010854101914214986 }  C1 FAIL   falsifier_rc=1
falsifier C2: mut.sh m_c2 synth/ssvi.ts 's|Math.sqrt(theta) \* Math.sqrt(1 + theta)|Math.sqrt(theta) * (1 + theta)|'
  stdout: { maxPhi: 0.6984879068630029, maxStruct: 0.9090904576921468, ... }  C1 FAIL C2 FAIL   falsifier_rc=1
```
Reference expressions come from the ledger text and were coded in the probe. Draws: θ log-uniform in [1e-5, 10], ρ ∈ (−0.999, 0.999), η ∈ (0, 4], k ∈ [−3, 3].
The structural properties (w(0)=θ, the k↔−k with ρ↔−ρ symmetry, slopes θφ(1±ρ)/2 as k→±∞, θφ² = η²/(1+θ)) hold.
These properties do not pin down the formula. Only the direct match to the ledger expression does that.
**UNVERIFIABLE by Channel B:** that this expression and this φ are the ones in Gatheral and Jacquier (2014). That needs the paper (Channel A).

### C3 — `p_c3.mjs`
```
probe_cmd: ./run.sh $R $S/p_c3.mjs      rc=0   wall 0.08s
stdout: { worstW: 0, worst1: 4.2670569591544365e-11, worst2: 3.616645221724521e-7 }
falsifier: mut.sh m_c3 synth/ssvi.ts '...(s * s * s))|...(s * s))'  -> { worstW: 0, worst1: 4.27e-11, worst2: 1.0562269837385379 }  falsifier_rc=1
falsifier: mut.sh m_c3b synth/ssvi.ts 's|(p.rho + u / s)|(p.rho + u * s)|' -> { worst1: 8289.038665461545, ... }  falsifier_rc=1
```
Errors are scaled by θφ (w1) and θφ² (w2). Pass condition: worst1 < 1e-7 and worst2 < 1e-5.

### C4 — `p_c4.mjs`
```
probe_cmd: ./run.sh $R $S/p_c4.mjs      rc=0   wall 0.16s
stdout: { nChecked: 119548, nNegativeDensityPoints: 37131, maxRelErr: 0.00010532677116130964, signMismatch: 0 }
falsifier: mut.sh m_c4 synth/arbitrage.ts 's|(1 / s.w + 0.25)|(1 / s.w + 0.5)|'
  stdout: { nChecked: 119548, nNegativeDensityPoints: 37131, maxRelErr: 0.26692332128424295, signMismatch: 3092 }  falsifier_rc=1
falsifier: mut.sh m_c4b synth/arbitrage.ts 's|+ s.w2 / 2$|+ s.w2|'  -> maxRelErr: 13.646149468405556, signMismatch: 3779   falsifier_rc=1
convergence: p_c4_coarse.mjs (steps ×5) -> maxRelErr: 0.07486428924140172 (rc=1, as expected for the coarse step)
```
The probe tests 600 generic (non-SSVI) smiles, `a + b·tanh(ck) + dk²` and `√(A² + s²(k−m)²) + q`, with exact analytic derivatives.
About 31% of the checked points have negative density, so the probe tests the sign on both sides.
The density comes from Black OTM prices (forward 1), Richardson second differences in K, rescaled by K·√w / n(d₋), with n(d₋) ≥ 1e-4.
The result: butterflyG equals this density factor, so g < 0 exactly where the price-implied density is negative.

### C5 — `p_c5.mjs` (price convexity, independent of butterflyG) + `p_c5b.mjs` (wide-k exact g)
```
probe_cmd: ./run.sh $R $S/p_c5.mjs 101 5000      rc=0   wall 5.6s
stdout: inside {"n":5000,"viol":0,"worst":0.23489188637725486,"worstP":{"th":0.00023653948401490717,"rho":-0.9368327444186434,"eta":1.0326136863203006,"k":-0.26,"etaTimes1pRho":2}}
        above  {"n":5000,"viol":1617,"worst":-1.2909072857575132,"worstP":{"th":0.01731715451165801,"rho":-0.9858692630426958,"eta":2.927320742821708,"k":0.0184,"etaTimes1pRho":5.813276286236942}}
other seeds (post-fix, same probe): seed 3: inside viol 0 (worst 0.2311), above 1661; seed 202: inside 0 (0.1808), above 1685; seed 303: inside 0 (0.2074), above 1638. All rc=0.
probe_cmd: ./run.sh $R $S/p_c5b.mjs      rc=0   wall 2.5s
stdout: { insideDraws: 20000, insideViol: 0, insideWorstMinG: 0.21444093911364534, wp: { th: 2.75, rho: 0.0114, eta: 1.977, at: 60 }, aboveViol: 7 }
falsifier: mut.sh m_c5 synth/ssvi.ts 's|return eta / (Math.sqrt(theta) \* Math.sqrt(1 + theta))|return eta / theta|'
  p_c5.mjs 3 1500 -> inside {"n":1500,"viol":814,"worst":-1084.6,...}  falsifier_rc=1;  p_c5b.mjs -> insideViol: 13196   falsifier_rc=1
```
Draws: ρ ∈ (−0.99, 0.99), θ log-uniform in [1e-4, 5] (p_c5.mjs) and [1e-6, 10] (p_c5b.mjs).
Inside the bound, η = (2/(1+|ρ|))·U, and every 10th or 4th draw sits exactly on the bound. Above it, η is 1 to 3 times the bound.
The k grid covers [−3, 3] at step 0.01 plus a √θ-scaled grid; p_c5b covers |k| ≤ 60.
Over 40,000 draws (2 × 20k) inside the bound, nothing comes close to arbitrage: the worst min g is about 0.18.
This is a randomized search and gives evidence, not a proof of sufficiency.

### C6 — `p_c6.mjs`
```
probe_cmd: ./run.sh $R $S/p_c6.mjs 19      rc=0   wall 1.7s
stdout: { evaluations: 112028000, wViolations: 0, callViolations: 0, worstRel: 0, wp: null }
(seeds 9 and 29: identical counts, 0/0, rc=0)
falsifier: mut.sh m_c6 synth/ssvi.ts '...|return eta / (theta * Math.sqrt(theta))|'
  stdout: { evaluations: 112028000, wViolations: 95446547, callViolations: 4745769, worstRel: 0.49994193546985094, ... }  falsifier_rc=1
```
Each draw: constant ρ, η log-uniform in [0.01, 10], and a 7-point increasing θ ladder starting log-uniform in [1e-6, 1e-2] (so it reaches up to about 40). The steps mix ratios up to ×4 with
near-ties (relative step < 1e-9).
Checks: w(k, θ) non-decreasing along the ladder for k ∈ [−50, 50], and the OTM option price at fixed K = e^k non-decreasing for |k| ≤ 3.
By put-call parity, OTM prices have the same T-monotonicity as calls.

### C7 — `p_c7.mjs`
```
probe_cmd: ./run.sh $R $S/p_c7.mjs      rc=0   wall 0.08s
stdout: { dates: 60, minThetaStep: 0.0004084402749007554, minTheta: 0.0004020606763003371, maxAbsRho: 0.85, maxEtaTimes1pRho: 1.4800000000000002, fails: [], nFails: 0 }
falsifier: mut.sh m_c7 synth/story.ts '...(story.rhoShock - story.rho0) * s * 2|'
  stdout: { ..., maxAbsRho: 1.15, ..., fails: [ 'date 20 |rho|>=1', 'date 21 |rho|>=1', 'date 22 |rho|>=1' ], nFails: 3 }  falsifier_rc=1
surviving (not a claim violation): m_c7b FOMC `T[m] >= toMeeting` -> `<`: nFails 0, falsifier_rc=0
```

### C8 — `p_c8.mjs`
```
probe_cmd: ./run.sh $R $S/p_c8.mjs      rc=0   wall 6.7s
stdout: { mixesTested: 120000, violations: 0, negativeControlExtrapolationSurfacesViolating: 20000 }
falsifier: mut.sh m_c8 synth/arbitrage.ts 's|o.w\[i\] = beta \* a.w\[i\] + alpha \* b.w\[i\]|o.w[i] = beta * a.w[i] - alpha * b.w[i]|'
  stdout: { mixesTested: 120000, violations: 21386585, negativeControlExtrapolationSurfacesViolating: 0 }  falsifier_rc=1
```
The random surfaces are 11 T × 40 k, monotone in T with about 20% exact ties. α takes the values {0, 1, U, U, 1e-12, 1−1e-12}.
Comparisons are exact float (tolerance 1e-15).

### C9 — `p_c9.mjs`
```
probe_cmd: ./run.sh $R $S/p_c9.mjs      rc=0   wall 0.11s
stdout: { frames: 60, nT: 11, nK: 26, cellsCompared: 1430000, maxRelErr: 3.3306690738754696e-16, alpha0Mismatch: 0 }
falsifier: mut.sh m_c9 lib/interpolate.ts (sqrt of mix -> mix of sqrt, i.e. lerp IV) -> maxRelErr: 0.1380197126413315   falsifier_rc=1
falsifier: mut.sh m_c9b lib/interpolate.ts 's/if (i === j || alpha === 0) {/if (i === j) {/' -> alpha0Mismatch: 41727   falsifier_rc=1
```
w = iv²·dte/365 is computed in the probe from the committed JSON. Inputs include i = j pairs and α ∈ {U, 1, 0.5, 1e-9}.
The α = 0 check uses strict `!==` against the frame-i IVs.

### C10 — `p_c10.mjs`
```
probe_cmd: ./run.sh $R $S/p_c10.mjs      rc=0   wall 7.0s
stdout: primary { surfaces: 6060, kPoints: 6001, minG: 0.25960221084753515, at: { i: 6, j: 7, al: 1, m: 0, k: -1.5 }, calendarViolations: 0 }
        secondary { minNumericalG: 0.27869644556845224, at: { i: 19, j: 20, al: 1, m: 1, k: -1.27 } }
falsifier: mut.sh m_c10c synth/story.ts 's|eta = Math.min(eta, ...)|eta = 4 * Math.min(eta, ...)|'
  stdout: primary { ..., minG: -0.4680432620401216, at: { i: 19, j: 20, al: 1, m: 0, k: -0.0125 }, calendarViolations: 0 }
          secondary { minNumericalG: -0.4631395901017446, ... }  falsifier_rc=1
falsifier: mut.sh m_c10b synth/story.ts 's|      acc += v \* (T\[m\] - prevT)|      acc = v * (T[m] - prevT)|'  (run with nosec)
  stdout: primary { ..., minG: 0.25960221084753515, ..., calendarViolations: 70458885 }  falsifier_rc=1
surviving (claim still true for it): m_c10 eta = 3*min(...) -> minG 0.008241560271470875, falsifier_rc=0
```
Primary: g is computed with the ledger formula (own code) on the repo's `mixSlices(sliceArrays(...))`, with 6,001 k points on [−1.5, 1.5].
Secondary: the mixed w(k) = (1−α)·ssviW_A + α·ssviW_B is built directly. Its density comes from Black prices (Richardson), at α step 0.05 and k step 0.01, where n(d₋) ≥ 1e-4.
The secondary check uses neither butterflyG nor mixSlices. Calendar: w at each k is non-decreasing over the 11 grid expiries.

### C11 — `p_c11.mjs`
```
probe_cmd: ./run.sh $R $S/p_c11.mjs      rc=0   wall 0.06s
stdout: { cells: 17160, maxAbsErr: 4.999969186736397e-7, monotoneViolations: 0, minWStepAlongT: 0.00025754612602465733, fails: [] }
falsifier: data copy, frames[30].iv[4][10] += 1e-6 (re-rounded) -> maxAbsErr: 6.547459776573561e-7   falsifier_rc=1
falsifier: data copy, frames[5].iv[3] set below w of iv[2] -> maxAbsErr: 0.0316, monotoneViolations: 26, minWStepAlongT: -1.2e-5   falsifier_rc=1
falsifier: mut.sh m_c11 synth/story.ts 'BUSINESS_DAYS_PER_YEAR = 252 -> 250' -> maxAbsErr: 0.014624465674039966   falsifier_rc=1
```
The analytic w uses the ledger formula (own code) with buildDateParams θ, ρ, η. The probe also checks that grid k/dte match STORY and that frame dates match.
The 4.99997e-7 maximum is consistent with rounding to 6 decimals, with a 3e-12 margin to the 5e-7 bound.

### C12 — `p_c12.mjs`
```
probe_cmd: ./run.sh $R $S/p_c12.mjs      rc=0   wall 0.06s
stdout: { etaTimes1pRho: 5, minButterflyG: -0.10817933142571584, numericalDensityMinG: -0.10817933412727807, at: -0.05699999999999994 }
falsifier: mut.sh m_c12 synth/arbitrage.ts ('- ((s.w1*s.w1)/4)...' -> '+ ...') -> minButterflyG: 0.2743006664757602   falsifier_rc=1
```
Uses `kRange(−1.5, 1.5, 3001)` and `minButterflyG`. Black-price convexity confirms the negative density independently, to 2.7e-9 agreement.

### C13 — `p_c13.mjs`
```
probe_cmd: ./run.sh $R $S/p_c13.mjs      rc=0   wall 0.28s
stdout: linear/smoothstep/easeInOutCubic each: e0 0, e1 1, nonMono 0, outOfRange 0, pairViol 0;
        aroundHalf (ulp below 0.5, 0.5): [0.49999999999999994,0.5] / [0.4999999999999999,0.5] / [0.49999999999999983,0.5]
falsifier: mut.sh m_c13b lib/easing.ts smoothstep 'x*x*(3.5 - 2.5*x)' -> nonMono: 133333, outOfRange: 273350, pairViol: 6098   falsifier_rc=1
falsifier: mut.sh m_c13c lib/easing.ts cubic '/ 2' -> '/ 1.5' -> nonMono: 1, pairViol: 168611, aroundHalf [0.49999999999999983, 0.33333333333333337]   falsifier_rc=1
surviving (claim still true for it): m_c13 cubic '/ 2.5' (upward jump at 0.5) -> all zero, falsifier_rc=0
```

### C14 (minor) — `p_c14.mjs`
```
probe_cmd: ./run.sh $R $S/p_c14.mjs      rc=0   wall 0.10s
stdout: { maxRelW: 0, maxErrW1: 6.2039700173208545e-12, maxErrW2: 0.0000020557522546561855 }
falsifier: mut.sh m_c14 synth/arbitrage.ts (w2 weights swapped: alpha*a.w2 + beta*b.w2) -> maxErrW2: 1.3099116672851463   falsifier_rc=1
```
