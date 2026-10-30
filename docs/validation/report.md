# Surface maths: evidence-gated validation report

Mode: **Mode 1, two independent subagents**. Date: 2026-10-29. Code at `b623e55` (`feat/v0.1`).
Inputs: [claims-ledger.md](claims-ledger.md) (pre-registered before either channel ran), [env-pin.txt](env-pin.txt).
Channel A (documents only: Gatheral and Jacquier 2014, arXiv:1204.0646v4; ECMAScript 2024): [channel-a.md](channel-a.md).
Channel B (runtime probes only, each with a failing mutant): [channel-b.md](channel-b.md).

## Verdict

**Pass after one fix.** Twelve material claims are accepted. C4 was REJECTED as stated and is fixed. C10–C12 are accepted on runtime evidence only, because they are about this data and no theorem covers them. Channel A also returned UNVERIFIABLE for C7 (it holds by hand only if the generator does not throw for this seed) and for C13 (floating-point `**`), so their runtime halves rest on Channel B alone. Channel A's verdict on C9 carries a minor note about the `i === j` path: that path returns frame i's IVs unchanged whatever α is.

## Evidence table

| ID | Claim (short) | Mat | A | B | Gate |
|---|---|---|---|---|---|
| C1 | `ssviW` is the GJ SSVI total variance | M | CONFIRMED (eq. 4.1) | CONFIRMED for the formula; the paper identity is not checkable at runtime | Split: formula, A+B ACCEPTED; paper identity, A only with B N/A-by-construction, ACCEPTED |
| C2 | `phi` is the power-law φ with γ = 1/2 | M | CONFIRMED (eq. 4.5) | CONFIRMED (θφ² = η²/(1+θ) and structure) | Split as for C1: ACCEPTED |
| C3 | `ssviSlice` derivatives are exact | M | CONFIRMED (by hand) | CONFIRMED (finite differences, mutant fails) | **ACCEPTED** |
| C4 | `g ≥ 0` for all k *is* the butterfly condition | M | **REFUTED**: Lemma 2.2 also needs d₊(k) → −∞ as k → +∞ | CONFIRMED (g < 0 exactly where the call-price density is negative) | Split. (a) The formula for g: A+B, ACCEPTED. (b) "g ≥ 0 alone suffices": **REJECTED**. Fixed below. |
| C5 | η(1+\|ρ\|) ≤ 2 suffices for butterfly | M | CONFIRMED (Thm 4.2, sufficient only) | CONFIRMED (random search; violations exist above it) | **ACCEPTED** |
| C6 | constant ρ, θ non-decreasing ⇒ no calendar arbitrage | M | CONFIRMED (Thm 4.1; ratio 1/(2(1+θ)) < 1) | CONFIRMED (call prices non-decreasing in T, random draws) | **ACCEPTED** |
| C7 | the story's params meet θ↑, θ>0, \|ρ\|<1, η(1+\|ρ\|) ≤ 2 | M | UNVERIFIABLE (follows by hand, if the code does not throw for this seed) | CONFIRMED (ran it) | Split. "Does not throw": B, ACCEPTED. "Properties if no throw": A, ACCEPTED |
| C8 | a convex mix of T-monotone surfaces is T-monotone | M | CONFIRMED | CONFIRMED | **ACCEPTED** |
| C9 | `interpolateIv` is linear in w, exact at α = 0 | M | CONFIRMED | CONFIRMED | **ACCEPTED** |
| C10 | every date and every in-between (101 α, all pairs + wrap) has g ≥ 0 and is calendar-monotone | M | UNVERIFIABLE (no theorem covers mixtures) | CONFIRMED | ACCEPTED **for this committed story only**, on runtime evidence |
| C11 | committed IVs are within 5e-7 of the analytic values; the grid is monotone in w | M | UNVERIFIABLE (data) | CONFIRMED | ACCEPTED on runtime evidence (a data fact) |
| C12 | the butterfly control has min g < 0 | M | UNVERIFIABLE (data) | CONFIRMED | ACCEPTED on runtime evidence |
| C13 | the easings are monotone with fixed endpoints | M | UNVERIFIABLE (`**` is implementation-approximated) | CONFIRMED (dense grid) | Split. Exact arithmetic: A, ACCEPTED. Floating point on V8: B, ACCEPTED |
| C14 | `mixSlices` mixes derivatives consistently | minor | CONFIRMED | CONFIRMED | ACCEPTED |

## The fix for C4

The code and its comment treated `g ≥ 0` as the whole butterfly condition. Lemma 2.2 of the paper also needs `d₊(k) → −∞` as `k → +∞`. For SSVI the right wing is `w(k) ~ θφ(1+ρ)k/2`, and `d₊ = −k/√w + √w/2 → −∞` exactly when that slope is below 2. So the condition is `θφ(1+ρ) < 4`.

- New function `ssviRightWingSlope` in `src/synth/ssvi.ts`. The comment in `src/synth/arbitrage.ts` now states both parts of the lemma.
- New test "check 2b" in `src/synth/story.test.ts`: every date and expiry of the story has a right-wing slope below 2. A convex mixture's wing slope is the same mixture, so in-between surfaces also pass.
- New unit tests in `src/synth/ssvi.test.ts`: a hand-worked value, agreement with `w(k)/k` at k = 1e6, and a case where the slope is 2 or more.
- Seen RED before the function existed (4 failures). A mutant that divides the slope by 20 fails 3 tests. The restored code passes 52/52 in `src/synth`.

## Limits

- C5, C6 and C10 rest partly on randomized or dense-grid search. That is evidence, not proof, outside the theorems that Channel A confirmed.
- The η clamp in `buildDateParams` never binds in this story (Channel B measured max η(1+|ρ|) = 1.48). No story date exercises it. The C5 control tests cover the condition itself.
- The checks are on the analytic surfaces and on the committed grid. They do not cover the real OptionsDX-derived dataset, which is market data and is not arbitrage-cleaned (see DATA.md).
