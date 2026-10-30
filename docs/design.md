# vol-surface-cinema: design (v0.1)

Status: proposed, 2026-10-29. Revised after the adversarial review on the same date. Audience: the implementer. Decisions and
rejected options are in [`adr/0001-architecture.md`](adr/0001-architecture.md). This doc is the build spec.

## 1. Problem and constraints

An animated 3D implied-volatility surface that plays date by date, for slide decks and social posts.
It has three outputs: a web page (play, pause, scrub, event annotations), a GIF/MP4 export, and an
optional Blender render.

- **Fresh clone must work**: `npm install && npm run dev` and `npm run build` (static, `base: './'`, no
  backend). Node `>=22 <23` (local: 22.23.1). There is one JS toolchain. Python is only for the Blender script.
- **The default demo is synthetic.** Vendor terms limit redistribution (§6). Nothing committed > ~50 MB. Git history is never
  rewritten (owner rule).
- **Export must be deterministic.** Frame `n` depends only on `(dataset, n, fps, size)`, never on wall-clock time.
- **Blender is not installed here.** Only the pure half of the Blender script can be tested.
- Team size is one. The repo is private, MIT, and the owner decides when it becomes public.

## 2. Non-goals (v0.1)

- Fitting real quotes or calibrating SVI to market data. The real dataset is shown as exported.
- Any backend, accounts, uploads, or live data.
- Embedding into vol-strategy-backtester as a component. No shared package. We copy and credit.
- Arbitrage repair of the real frames. They are shown as-is and labelled.
- Byte-identical MP4/GIF across machines. Only the captured PNG frames must be reproducible on one machine.
- Audio, title sequences, multiple surfaces side by side, mobile-first UI.

## 3. Architecture and the seam

```
public/data/*.json ──parseSequence──► Sequence ──► Timeline(spec) ──n──► FrameState{i, j, alpha}
                                         │                                   │
                                         └─ w-grids (precomputed) ──interpolate(alpha)──► iv grid
                                                                                 │
                         ┌─────────────── render(n) (impure, three.js) ◄─────────┘
   live:  Player(clock) ─┘ n                        export: window.__cinema.renderFrame(n)
                                                           ▲ Playwright ──PNG──► ffmpeg (stdin)
   Blender: export --format frames-json ──► baked per-frame grids ──► render_surface_sequence.py
```

**The seam is the integer frame index `n`.** Everything visual is a pure function of `n`. That covers heights, colours, camera
azimuth, the date caption, and annotation opacity. Live mode gets `n` from `Player` (wall clock). Export gets it from `renderFrame(n)`.
Blender gets it from pre-baked frames. Export mode disables everything time-based outside this seam: CSS transitions, OrbitControls
damping, and rAF deltas.

Stack: **plain three.js 0.186.1 + vanilla TypeScript + Vite**. React and r3f are not used (ADR §1).

## 4. Repo layout, toolchain, copied code

```
package.json            node >=22 <23; deps: three 0.186.1; dev: @types/three 0.186.0, vite 7.3.7,
                        vitest 4.1.12, typescript 5.8.3, jsdom 26.1.0, playwright 1.62.0 (= chromium-1234)
index.html  vite.config.ts (base './')
tsconfig.json           strict, noEmit, allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax,
                        module/moduleResolution "nodenext" for scripts/ (a separate tsconfig.node.json is fine)
src/main.ts             boot: read query, load dataset, detect WebGL, mount live or export mode
src/lib/                PURE, each with *.test.ts; no three import, no DOM, no clock
src/synth/              PURE: prng.ts (mulberry32), ssvi.ts, story.ts, generate.ts
src/render/             IMPURE: scene.ts (three), heatmap.ts, controls.ts, overlay.ts, exportHook.ts, webgl.ts
scripts/generate-synthetic.ts   writes public/data/synthetic-regime-story.json
scripts/export.ts               CLI; pure helpers in scripts/export/{args,ffmpegArgs,paths}.ts (+ tests)
public/data/            index.json, synthetic-regime-story.json, optionsdx-spy-4dates.json
public/fonts/           Inter variable woff2 + OFL.txt (one font for live and export)
tools/blender/          render_surface_sequence.py, test_render_surface_sequence.py, requirements-dev.txt (pytest pinned)
tests/e2e/export.smoke.ts       Playwright; not part of `npm test`
docs/  DATA.md  CREDITS.md  LICENSE (MIT)  README.md (with docs/media/demo.gif)
```

**Imports.** Every relative import in `src/lib`, `src/synth` and `scripts/` carries the `.ts` extension
(`import { rampLinear } from './colorRamp.ts'`). Node 22's type stripping runs `scripts/*.ts` directly, and it does not
resolve extension-less specifiers. Node 22.23.1 ran a `.ts` file with no flag in this session. Use no enums, namespaces, or
parameter properties, which `erasableSyntaxOnly` enforces. Vite and vitest accept the `.ts` specifiers.

**Scripts.** `dev`, `build` (`tsc --noEmit -p . && vite build`), `preview`, `test` (vitest run), `gen:data`
(`node scripts/generate-synthetic.ts`), `export` (`npm run build && node scripts/export.ts`), `test:e2e`,
`test:py` (from M5: `uv run --with-requirements tools/blender/requirements-dev.txt pytest tools/blender`).
`verify` is `npm test && npm run build` in M0–M4, and adds `npm run test:py` in M5, when the Python tests exist.

**Copied files and their edits** (source `vol-strategy-backtester/app/src`, commit `35cb682`):

| File | Edit |
|---|---|
| `lib/surfaceGeometry.ts` | Split into `buildTopology(nT, nK)` → `{indices, lineIndices}` and `writeHeights(k, dte, iv, ivExtent, positions, colors)` (fills preallocated arrays, fixed IV extent passed in, no per-grid min/max). `axisLabels` is unchanged. Imports get `.ts`. |
| `lib/surfaceScene.ts` | Imports become `import type … from './surfaceGeometry.ts'`. Re-tune the `ORBIT_TARGET` y (0.35) once the fixed extent is in place, and update its comment. |
| `lib/colorRamp.ts` | Code is unchanged. The comment about r3f `flat` becomes "renderer.toneMapping = NoToneMapping". |
| `lib/framing.ts`, `lib/labelProjection.ts`, `lib/format.ts` | Unchanged (format: drop `compact` and `bps` if unused). |
| `views/webgl.ts` → `render/webgl.ts` | Unchanged. |
| `views/SurfaceHero.tsx` | Not copied. Its scene setup (materials, polygonOffset, axis segments, camera `[1.9, 1.35, 2.5]`, fov from `fovForAspect`, label projection each render) is re-expressed in `render/scene.ts`. |
| `lib/charts.tsx` Heatmap | Not copied (React). It is rewritten as `render/heatmap.ts`, a 2D canvas drawing one rect per cell coloured by `rampSrgb`, with DOM axis labels. Its pure part `heatmapCells(iv, extent, width, height) → {x,y,w,h,css}[]` gets a test. |
| the `*.test.ts` of each file above | Imports get `.ts`. The surfaceGeometry tests move to the new API, plus "the same IV gives the same height in two frames". |

## 5. Data and maths

### 5.1 Synthetic surface: SSVI, generated offline, committed

SSVI (Gatheral & Jacquier 2014) is `w(k, θ) = θ/2 · (1 + ρφk + sqrt((φk + ρ)² + 1 − ρ²))`. It uses
`φ(θ) = η θ^(−γ) (1+θ)^(γ−1)` with γ = 1/2, so `θφ = η√θ/√(1+θ)` and `θφ² = η²/(1+θ)`. Each date `t` has one surface with
knobs `ρ_t`, `η_t` and the ATM term structure `θ_t(T)`. **ρ_t and η_t are constant across T within a date**, which is what the SSVI form assumes.

- **Calendar (GJ Thm 4.1).** SSVI has no calendar arbitrage iff (a) `∂_T θ_t(T) ≥ 0` and (b) `0 ≤ ∂_θ(θφ(θ)) ≤
  (1/ρ²)(1 + sqrt(1−ρ²)) φ(θ)` for all θ > 0. The upper bound is +∞ when ρ = 0.
  - Condition (a) holds by construction: `θ_t(T) = Σ v_t(T_m)·ΔT_m` with forward variance `v_t ≥ v_min > 0`.
  - Condition (b) holds for this φ: `∂_θ(θφ) = (η/2) θ^(−1/2) (1+θ)^(−3/2) ≥ 0`, and the upper bound reduces to
    `1/(2(1+θ)) ≤ (1+sqrt(1−ρ²))/ρ²`. The left side is ≤ 1/2 and the right side is ≥ 1 for |ρ| ≤ 1, so it always holds.
  - Positive forward variance alone gives only (a). (b) is a property of the chosen φ.
- **Butterfly (GJ Thm 4.2, sufficient).** The conditions are `θφ(1+|ρ|) < 4` and `θφ²(1+|ρ|) ≤ 4` for all θ.
  - The generator clamps `η_t(1+|ρ_t|) ≤ 2 − 1e-3`. Then `θφ(1+|ρ|) < η(1+|ρ|) ≤ 2` and
    `θφ²(1+|ρ|) ≤ η²(1+|ρ|) ≤ 4/(1+|ρ|) ≤ 4`.
  - The implementer checks the theorem statements against the paper. §5.4 tests `g(k)` directly either way.
- **Regime story** (`story.ts`, plain data):
  - 60 business dates from 2030-01-02. The future year marks them as fictional.
  - Base: a calm, upward term structure. Forward variance `v_base` has AR(1) jitter from mulberry32, seed 20301.
  - Shocks: `v_t(T) += A_j e^(−(t−t_j)/τ_j) e^(−T/τ_T)` for t ≥ t_j. This is a short-dated spike that inverts the ATM vol curve and
    then decays. ρ moves toward −0.85 and η rises in the shock, with the same decay.
  - FOMC: event variance `θ_t(T) += J·1[T ≥ T_meeting − t]` before the meeting and 0 after. This is a step up in T, so it is still monotone.
  - Events: "Volatility spike", "FOMC decision", "Recovery".
- **Rounding and the committed file.** The generator rounds each IV to **6 dp** (`Math.round(x·1e6)/1e6`) before writing.
  The JSON is written with `JSON.stringify(doc, null, 2)` plus a trailing newline. `npm run gen:data` is the only writer.
- Grid: the same as the real dataset, 26 k ∈ [−0.30, 0.20] step 0.02 × 11 DTE {7,14,21,30,45,60,90,120,180,270,365}.

### 5.2 Optional real dataset

`public/data/optionsdx-spy-4dates.json` is built once by a small import script, `scripts/import-backtester-frames.ts`.
The script reads the source repo's `surface_frames.json` and keeps only the fields the player uses:
- per frame: `date`, `iv`, `cell_flags`, `quoted_share`;
- per file: the grid and the run ids.

`spot`, `vix_close`, `atm_iv_30d` and the source labels are not imported. Labels and events are written in words only:
"calm, late 2017", "February 2018 volatility spike", "March 2020 crash", "mid-2023".

It is not the default. Pick it from the dataset menu or with `?dataset=optionsdx-spy-4dates`. Playback: `hold_s 1.0, transition_s 2.0, loop false`.
- Badge: "SPY implied vols derived from OptionsDX quotes (via Kaggle). Interpolated between dates."
- During transitions the caption reads `2018-02-05 → 2020-03-16 (interpolated)`. It also shows "N% of cells extrapolated", from `1 − quoted_share`.

Measured: all 4 frames are calendar-monotone in w on the grid (0 violations), with 0 NaN. Butterfly is not checked or enforced on these frames.

### 5.3 Interpolation between dates: linear in total variance, per cell

At load, precompute `w[i][j] = iv[i][j]² · dte[i]/365` for each keyframe. Between keyframes A and B,
`iv = sqrt(((1−α)·wA + α·wB) / T)`, where α is the eased value from §8.

- **Calendar:** preserved. A convex combination of two functions that increase in T increases in T.
- **Butterfly:** not guaranteed in general, because g is nonlinear in w and the mixtures are not SSVI.
  - Measured in this session: 300 random pairs of arbitrage-free SSVI surfaces × 21 α gave 0 violations, min g = 0.25.
  - 50/50 mixes of arbitrage-free raw-SVI slices gave min g = 0.040.
  - This is evidence, not proof. So §5.4 tests the story densely. If a future story fails, add intermediate dates.
- **Loop wrap.** With `loop: true` the timeline interpolates across the wrap pair (last → first), so that pair is tested too.
- Rejected: lerp in IV (not calendar-safe). Rejected: lerp of SSVI parameters (SSVI-only, and linear η and ρ can break `η(1+|ρ|) ≤ 2`
  mid-way).

### 5.4 Validation tests (the "SVI is validated" criterion)

Arbitrage checks run on the **analytic** SSVI from the story parameters, at k ∈ [−1.5, 1.5] (2001 points) and every grid T.
They use `g(k) = (1 − k w'/(2w))² − (w'²/4)(1/w + 1/4) + w''/2` with closed-form `w'` and `w''`. A mixture's derivatives
are the same mixture of derivatives, so in-between surfaces are checked exactly.

1. `ssvi.ts` against hand-worked values. At k = 0, w equals θ. Analytic `w'` and `w''` match central differences to 1e-6.
2. Butterfly at every date: min g ≥ 0.
3. Calendar at every date: `w(k, T_{m+1}) ≥ w(k, T_m)`.
4. **Dense interpolation:** for every adjacent pair of dates, *and* the wrap pair when the story has `loop: true`, at 101
   points α ∈ {0, 0.01, …, 1}, both check 2 and check 3 hold for `(1−α)wA + αwB`. This covers every eased α the player can show.
5. Committed grid: rounded values are still calendar-monotone in w on the 11-point T grid, and are finite and positive.
6. Drift: `generate()` (with its 6 dp rounding) deep-equals the parsed committed file **exactly**. Each committed IV is within
   **5e-7** of the unrounded analytic `sqrt(w/T)`, which is half a unit in the 6th decimal. If a Node or V8 upgrade changes a last-ulp
   `Math.exp` result and that flips a rounding, check 6 fails. Rerun `gen:data` and commit the result. That is the intended signal.
7. Known-bad controls, which prove that checks 2 and 3 can fail:
   - Butterfly control: ρ = −0.8, η = 5/1.8 (so η(1+|ρ|) = 5), θ = 0.02. Assert min g < 0.
     Measured min g = −0.108. This violates `θφ²(1+|ρ|) ≤ 4` (value 13.6).
     η(1+|ρ|) = 2.6 is **not** a control: it was measured at min g = +0.25.
   - Calendar control: a θ(T) that falls between two expiries. Assert that check 3 fails.

## 6. Data rule and notices

| Field | Source | Terms | v0.1 |
|---|---|---|---|
| synthetic surfaces | our generator | MIT | default, committed |
| real `iv`, `cell_flags`, `quoted_share` | derived from OptionsDX EOD quotes via Kaggle `dudesurfin/spy-options-eod-volatility-surface-2010-2023` | Kaggle lists MIT. No OptionsDX terms found (404 on 2026-10-29) | optional dataset, derived grid values only, no quote rows |
| `spot` (Yahoo), `vix_close` (Cboe), `atm_iv_30d` | the source file | Yahoo: personal use. Cboe: no redistribution without consent | **not imported**: the player does not use them |

The rationale for committing the real grids is the owner's policy. Small derived series may be committed with a notice naming each source
and its terms.
- **This is their first commit anywhere.** `surface_frames.json` is untracked in vol-strategy-backtester. It is not in `git ls-files` and
  not in origin/main `35cb682`.
- The repo is private. Whether and when it becomes public is the owner's decision.

`DATA.md` names each source, its terms URL, what was derived, and the source commit. `source.providers` in the JSON carries the same.

## 7. Data contract: `surface-sequence` v1

```ts
interface Sequence {
  schema: 'vol-surface-cinema/surface-sequence'; schema_version: 1
  id: string                       // /^[a-z0-9-]{1,64}$/, equals the file stem
  title: string; badge: string     // badge is always on screen
  synthetic: boolean
  grid: { k: number[]; dte: number[] }   // each strictly increasing, length >= 2; dte integers >= 1
  frames: Frame[]                  // 1..10_000, dates strictly increasing
  events: Event[]                  // may be empty
  playback?: { fps?: number; hold_s?: number; transition_s?: number; easing?: Easing; loop?: boolean }
             // defaults: fps 30, hold_s 0, transition_s 0.2, easing 'smoothstep', loop true
  display?: { iv_range?: [number, number]   // fixed vertical scale; default = global min/max over all frames
              orbit_turns?: number }        // integer >= 0, default 0 (no orbit), see §9
  source: { kind: 'synthetic' | 'derived'; notice: string; source_commit?: string
            generator?: { script: string; seed: number }
            providers?: { name: string; role: string; terms_url: string; licence: string }[] }
  licence: string                  // 'MIT' or 'see DATA.md'
}
interface Frame { date: string /* YYYY-MM-DD, a valid calendar date */; iv: number[][] /* [dte][k] */
                  label?: string; cell_flags?: number[][]; quoted_share?: number }
interface Event { date: string /* must equal some frame.date */; label: string
                  kind?: 'shock' | 'policy' | 'recovery' | 'note'
                  hold_s?: number; show_before_s?: number; show_after_s?: number }  // defaults 1.0, 0.5, 1.5
type Easing = 'linear' | 'smoothstep' | 'easeInOutCubic'
```

`parseSequence(raw: unknown)` returns `{ ok: true; value: Sequence }` or `{ ok: false; errors: ContractError[] }`.
- `ContractError = { path: string /* e.g. "frames[3].iv[2][5]" */; message: string }`. Errors are collected, up to 50.
- IV must be finite and `0 < iv < 5`. `null` is rejected.
- An unknown `schema_version` is rejected with "upgrade vol-surface-cinema". Unknown extra keys are allowed.
- `public/data/index.json` (from M1) lists `{id, title, file}`. `?dataset=` must match an id in it, so the page never fetches
  an arbitrary URL.

## 8. Timeline: the interface the tests target (`src/lib/timeline.ts`, pure)

```ts
export interface TimelineSpec {
  dates: number                 // N >= 1 (N = 0 -> RangeError)
  transitionFrames: number      // F >= 1 integer (F = 1 is a jump cut)
  holdFrames: readonly number[] // length N, integers >= 0
  loop: boolean                 // true: wrap transition N-1 -> 0 is interpolated (ignored when N = 1)
  easing: Easing
}
export interface FrameState {
  n: number; i: number; j: number   // j = i during a hold; i+1, or 0 on the wrap, during a transition
  rawAlpha: number                  // in [0, 1)
  alpha: number                     // ease(rawAlpha)
  phase: 'hold' | 'transition'
}
export function totalFrames(s: TimelineSpec): number
export function frameAt(s: TimelineSpec, n: number): FrameState
export function frameAtTime(s: TimelineSpec, seconds: number, fps: number): FrameState // frameAt(floor(seconds*fps + 1e-9))
export function startFrameOf(s: TimelineSpec, i: number): number
export function specFromSequence(seq: Sequence, fps: number): TimelineSpec
```

**Layout (normative).**
- Date `i` is shown at α = 0 for `1 + h_i` frames (phase `hold`).
- Then come `F − 1` frames with `rawAlpha = m/F`, m = 1..F−1 (phase `transition`).
- Segment length is `h_i + F`. The last date without loop has length `1 + h_{N−1}`.
- `total = Σ_{i<N−1}(h_i + F) + (loop ? h_{N−1} + F : 1 + h_{N−1})`.
- N = 1 is a static sequence with `total = 1 + h_0`, and loop has no wrap.
- No frame with α = 1 is ever emitted, so no keyframe is duplicated.

**specFromSequence.**
- `F = max(1, round(transition_s · fps))`.
- `h_i = max(round(hold_s · fps), round(e.hold_s · fps) for each event e on date i)`.
- Missing values take the §7 defaults.
- **fps precedence:** CLI `--fps` > page `?fps=` > `playback.fps` > 30. For GIF, the CLI default is 25 (§10).

**Arguments.**
- `n` must be an integer ≥ 0. A negative or non-integer `n` throws RangeError, always.
- When `n ≥ total`, a looping timeline returns `n mod total`. A non-looping one clamps to `total − 1`.
- `seconds < 0` throws RangeError. `i` must be in [0, N).
- Callers such as the player wrap or clamp before they call.

**Required tests.**
- `total` for N = 1, 2, 5, with and without loop.
- Every **transition** frame maps to a unique `(i, j, rawAlpha)`. The hold frames of date i all map to `(i, i, 0)`.
- Over n, `(i, rawAlpha)` is non-decreasing apart from the wrap.
- Event holds lengthen exactly their own date.
- With loop, `frameAt(total)` equals `frameAt(0)`, and frame `total − 1` is on the wrap transition.
- `frameAtTime(t)` equals `frameAt(floor(t · fps))`.
- 10 000 calls of `frameAt` take < 50 ms.

**easing.ts.** `ease(kind, x)` for x ∈ [0, 1]. It is monotone, with ease(0) = 0 and ease(1) = 1.
- `smoothstep` = 3x² − 2x³.
- `easeInOutCubic` = 4x³ for x < 0.5, else 1 − (−2x+2)³/2.
- Tests pin the values at x = 0.25 and x = 0.5.

**events.ts.** `activeEvents(s, events: {dateIndex, beforeFrames, afterFrames}[], n) → {index, opacity}[]`.
- An event is active when `startFrameOf(i) − before ≤ n < startFrameOf(i) + 1 + h_i + after`, clamped to [0, total). Windows do not wrap.
- `opacity` ramps linearly over 6 frames at each edge. This is never a CSS transition.

**captions.ts.** `dateCaption(state, dates, gapDays = 7)`.
- During a hold, it returns `dates[i]`.
- During a transition between dates ≤ gapDays apart, it returns `dates[i]` while **rawAlpha** < 0.5, else `dates[j]`.
  It uses rawAlpha, not eased α, so the switch frame is the same for every easing.
- During a transition between dates further apart, it returns `"A → B (interpolated)"`.

**player.ts.** `createPlayer({ total, fps, loop, now })`, where `now()` returns **milliseconds** (`performance.now`).
It returns `{ play(), pause(), seek(n), current(), state() }`, with states `'playing' | 'paused' | 'ended'`.
- `current() = n0 + floor((now() − t0) · fps / 1000)`, where `(n0, t0)` is set by `play()` or `seek()`.
- With `loop`, the result is taken modulo total.
- Without loop, when it reaches `total − 1` the state becomes `'ended'` and `n` stays at `total − 1`.
- `play()` from `'ended'` restarts at 0.
- `pause()` freezes `n`.
- `seek(n)` clamps to [0, total−1]. It keeps `'playing'` or `'paused'`. From `'ended'` it goes to `'paused'`.
- Tests use a fake clock.

## 9. Rendering (src/render, impure, thin)

- `scene.ts`:
  - WebGLRenderer with `toneMapping = NoToneMapping`. `preserveDrawingBuffer` is on only in export.
  - Unlit vertex-colour mesh with polygonOffset, grid wireframe, and axis segments, as in SurfaceHero.
  - The IV extent is fixed per sequence, from `display.iv_range` or the global min/max. The copied per-grid normalisation
    would have hidden the spike.
  - Camera: start at SurfaceHero's `[1.9, 1.35, 2.5]` looking at `ORBIT_TARGET`. That start sets `a0` (azimuth) and the radius.
    Azimuth is `a0 + 2π · orbit_turns · n / total`. With an integer number of turns the loop is seamless, and with 0 there is no orbit.
  - OrbitControls (`three/addons`, no damping) are added in live mode only, and only while paused. Pressing play resets the camera to the
    formula, so a live frame matches the export frame.
- `overlay.ts`: the date caption, badge and event pill are DOM nodes set with `textContent` only. Labels come from data, never `innerHTML`.
  The font is Inter (bundled). `ready` waits for `document.fonts.ready`.
- `controls.ts`:
  - Play/pause button.
  - Range input `0..total−1`. Scrubbing calls `player.seek`.
  - Event and date list. Clicking an item calls `seek(startFrameOf(i))`.
  - Keys: Space plays or pauses. ← and → step one frame.
- `heatmap.ts` (§4): a canvas fallback when `detectWebGL()` is false or on `webglcontextlost`. It redraws per frame, so the controls still work.

## 10. Deterministic headless export

**Page side**, `?export=1&dataset=<id>&w=<px>&h=<px>&fps=<n>`:
- No controls and no OrbitControls.
- The `.export` class sets `transition: none !important; animation: none !important`.
- The pixel ratio is 1 and the stage size is exact.

```ts
window.__cinema = {
  version: 1,
  ready: Promise<{ totalFrames: number; fps: number; width: number; height: number }>, // rejects on load/contract/WebGL failure
  renderFrame(n: number): Promise<void>, // applies frameAt(n), renders, updates overlay, then awaits 2 rAF.
                                         // Rejects RangeError if n is outside [0, totalFrames), Error('busy') if a call is pending.
}
```

**CLI** `npm run export -- --format gif|mp4|frames-json --dataset <id> [--fps N] [--size WxH] --out <path> [--force] [--max-frames N] [--gpu]`:

1. **Validate** with the pure `args.ts`.
   - fps is an integer in 1..60. MP4 default is `playback.fps`, else 30.
   - GIF fps must be in {10, 20, 25, 50}, because GIF delays are centiseconds. GIF default is 25.
   - `--size`: each side 16..4096 and **even**. Defaults are 1280x720 (MP4) and 800x450 (GIF).
   - `--out` is resolved to an absolute path, so it can never start with `-`. Its extension must match the format, and its
     parent directory must exist. It must not already exist unless `--force` is given.
   - `totalFrames ≤ --max-frames` (default 10 000).
   - Any violation exits 2.
2. **Preflight.** Run `ffmpeg -version` (from the `FFMPEG` env var or PATH). If it is missing, exit 3 before the browser starts.
   If Playwright's browser is missing, exit 3 with the hint `npx playwright install chromium`.
3. **Serve and launch.**
   - Serve `dist/` with Vite's `preview()` API on `127.0.0.1`, port 0.
   - Launch Playwright chromium headless with `--use-angle=swiftshader --enable-unsafe-swiftshader` (unless `--gpu`),
     deviceScaleFactor 1.
   - A `pageerror` or console error exits 4.
   - Measured on this machine: chromium-1234 headless shell reports WebGL2 on "ANGLE (Vulkan SwiftShader)".
4. **Capture loop.** For each frame:
   - `renderFrame(n)`, then `locator('#stage').screenshot({ type: 'png' })`. The stage screenshot includes the DOM overlays.
   - Write the PNG to ffmpeg stdin and await `drain`.
   - There is a 10 s timeout per frame. ETA goes to stderr.
5. **Encode.** ffmpeg runs from an argv array with `shell: false`. The args come from the pure, tested `ffmpegArgs.ts`:
   - MP4: `-hide_banner -loglevel error -f image2pipe -framerate F -c:v png -i - -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart <out>.partial.mp4`
   - GIF (one pass): `... -i - -filter_complex [0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5 -loop 0 <out>.partial.gif`
6. **Finish.**
   - On success, rename `.partial` to `<out>`.
   - On any failure: kill both processes, delete `.partial`, and print the last 20 lines of ffmpeg stderr.
   - Exit 4 for a render failure, 5 for an encode failure.
7. **`frames-json`** writes `{ fps, width, height, grid, extent, frames: [{ n, iv, caption, events: [{label, opacity}] }] }`.
   It uses the same pure modules in Node and needs no browser or ffmpeg.

**Setup** (README and e2e): `npm install && npx playwright install chromium`. ffmpeg comes from the OS package manager.

## 11. Blender (optional, `tools/blender/render_surface_sequence.py`)

- **Copy and split.** Copy `render_surface_hero.py` and keep its pure top half and bpy bottom half. Reuse `validate_surface`, `normalise`,
  `build_surface_mesh`, the camera maths, `engine_candidates` and `parse_args`.
- **Input.** The input is the `frames-json` from §10.7, so the timeline and interpolation exist only in TS.
- **Animation.** One shape key per baked frame. The key's value is 1 at frame n and 0 at n±1, with CONSTANT interpolation.
- **Colour.** Colour comes from object-space height through shader nodes: Geometry → Separate XYZ → Map Range with the fixed extent → ColorRamp.
  Vertex colours cannot be shape-keyed.
- **Captions.** Captions are text objects with `hide_render` keyframed from `events`.
- **Tests.** These pure functions get pytest tests without bpy: `validate_frames_doc`, `frame_vertex_heights(doc, n)`,
  `caption_keyframes(doc)` (returns `(frame, label, visible)`), `shape_key_schedule(n_frames)`.
- **Limits.** The script caps at 2000 shape keys. Above that it refuses and suggests `--every 2`. The bpy half is untested, and the README says so.

## 12. Failure modes

| Case | Behaviour | Test |
|---|---|---|
| Dataset 404 or network error | Error panel names the URL and status. No blank canvas. `ready` rejects | unit (fake fetch) |
| Invalid JSON or schema | Panel lists the first 10 `ContractError` paths | contract.test |
| NaN, Infinity, null, ≤ 0, or ≥ 5 IV | Rejected with a path. Python's bare `NaN` token fails JSON.parse and is reported as a parse error | contract.test |
| Grid or row length mismatch, unsorted dates, event on a missing date, N = 0 | Rejected | contract.test, timeline.test |
| WebGL unavailable or context lost | Canvas heatmap with working controls. **Export mode exits 4, never a silent heatmap** | unit plus e2e flag |
| Headless with no GPU | SwiftShader (measured working here) | e2e smoke |
| ffmpeg or Playwright browser missing | Exit 3 before rendering | preflight unit |
| ffmpeg dies mid-stream | Kill, delete `.partial`, exit 5 | unit with fake spawn |
| Concurrent `renderFrame` | Second call rejects `busy` | unit |
| Re-run export | Same PNG bytes on the same machine. MP4/GIF bytes are not promised | e2e: hash frame k twice |
| Malicious label, dataset id, or path | `textContent` only. Id whitelisted. Paths resolved. argv only | unit |
| 100× frames (36k) | No per-frame allocation. `--max-frames` guard. Contract cap 10k frames. Time grows linearly, with ETA | timeline perf test |
| 100× dates in JSON (~17 MB) | Loads. The generator refuses to write > 20 MB | generator unit |

## 13. Source of truth, blast radius, rollback

- The synthetic JSON is derived from `src/synth` + seed (drift test, §5.4.6). The real JSON is a frozen import at the recorded
  source commit. It is stale by design.
- Timeline and interpolation logic live only in `src/lib`. The page, the CLI and `frames-json` (and so Blender) all import it.
- Blast radius: a static site plus a local CLI, with no backend and no user data. Rollback is to revert the commit and rebuild.

## 14. Signals that show it working

- `npm test` prints the counts for timeline, contract, interpolation, SSVI and the copied helpers. From M5, `npm run test:py` prints the pytest counts.
- e2e smoke on the synthetic story at 320x180, 10 fps. It passes when all of these hold:
  - `ffprobe` frame count == `totalFrames`;
  - duration == total/fps ± 1 frame;
  - frame 0 has > 5% non-background pixels;
  - frame k gives the same PNG sha256 on two renders.
- Mutation check: break `frameAt` (off-by-one in the segment length) and `interpolate` (lerp IV instead of w), and confirm the tests fail.

## 15. Cost (order of magnitude)

- **Bundle** (measured, esbuild minify + gzip -9): three subset + OrbitControls is 555 KB raw / **138 KB gz**. With
  react-dom + r3f (+drei) it is 1.14 MB / **314 KB gz**.
- **Data:**
  - Synthetic, 60 frames × 286 cells at 6 dp with 2-space indent: about **150–220 KB**. Compact JSON of random 6 dp IVs on this
    shape measured 173 KB.
  - Real, 4 frames with flags: about 15–25 KB.
  - The README GIF is ≤ 5 MB.
- **Export** (measured in M3, SwiftShader on a 20-core machine, ffmpeg 1 process): 0.17 s/frame at 1280x720 (450 frames, MP4 in 75.0 s,
  803 KB) and 0.17 to 0.18 s/frame at 800x450 (375 frames, GIF in 65 to 69 s, 3.0 MB). A 320x180 smoke export runs at 0.10 s/frame.
  Disk use is about 0, because frames are piped.

## 16. Increments (each leaves a runnable repo)

1. **M0 Scaffold.** Vite + TS with the §4 tsconfig, the copied pure libs and their tests (with the edits in §4), LICENSE, CREDITS.md.
   The page draws one hard-coded grid. `npm install && npm run dev`, `npm run verify` (test + build) are green.
2. **M1 Synthetic data.** `src/synth`, `contract.ts`, `public/data/index.json`, `gen:data`, the committed story JSON, all §5.4 tests
   including the controls. The page loads the dataset via index.json and draws frame 0. A bad file shows the error panel.
3. **M2 Playback.** timeline, easing, interpolate, events, captions, player, controls, overlay, canvas heatmap fallback,
   fixed extent, orbit formula.
4. **M3 Export.** exportHook, CLI, e2e smoke (`npx playwright install chromium` documented), measured s/frame replacing the
   §15 estimate. The README GIF is made with `npm run export`.
5. **M4 Real dataset (optional).** The import script, the committed file, DATA.md, the dataset menu, the interpolated-date caption, the extrapolated share.
6. **M5 Blender.** `frames-json`, `render_surface_sequence.py`, pytest on the pure half. `test:py` joins `verify`.

## 17. What would change this design

- If the page must embed into the backtester's React app, r3f reuse wins. The ~176 KB gz extra cost is already paid there.
- If a story fails the dense in-between butterfly test even with finer dates, interpolate SSVI parameters in a
  constraint-safe form (e.g. interpolate `η(1+|ρ|)` and `ρ`).
- If SwiftShader exports measure > 1 s/frame, make `--gpu` the default. Output would then be reproducible only per machine.
- If the owner rules derived OptionsDX values out, skip M4 and remove the file going forward with a normal commit.

## Credits

Copied and adapted from [vol-strategy-backtester](https://github.com/rajib2k5/vol-strategy-backtester) (MIT, © 2026
Rajib Bahar):
- the surface geometry, colour ramp, framing, label projection and formatting helpers, with their tests;
- WebGL detection;
- the scene setup of `SurfaceHero.tsx`;
- the Blender script structure.

The heatmap fallback is a rewrite of its React Heatmap. The SSVI formulation follows its `src/volbt/illustrative.py`.
`CREDITS.md` lists each file with its source path and commit (`35cb682`).

## Implementation notes (M0 to M3)

Gaps found while building, each resolved with the simplest option consistent with the design.

- **GJ theorems checked.** Theorems 4.1 and 4.2 of arXiv 1204.0646 were read in the paper's text. The statements in §5.1 match.
- **npm peer-dependency crash.** `npm install` of the pinned set (vitest 4.1.12) fails inside npm 10.9.8's arborist
  (`Cannot read properties of null (reading 'edgesOut')`). `.npmrc` sets `legacy-peer-deps=true`, and `package-lock.json` is committed.
  A fresh clone installs with plain `npm install`.
- **One tsconfig.** `tsconfig.json` uses `module`/`moduleResolution` `nodenext` for `src`, `scripts`, `tests` and `vite.config.ts` alike, so
  `tsc --noEmit -p .` checks everything and no `tsconfig.node.json` is needed. There is no lint step in the design, so `verify` has none.
- **Font.** The page uses a system font stack (`--font` in `src/style.css`). No Inter file was vendored: none was available under the
  100 KB limit with its licence, and a network font would break the offline export. Nothing is loaded at runtime from a CDN.
- **`heatmapCells` lives in `src/lib/heatmapCells.ts`**, not `render/heatmap.ts`, so that `src/lib` stays the home of everything pure and tested.
  `render/heatmap.ts` only draws.
- **Story constants.** `A = 0.2`, `etaShock = 0.8`, FOMC `J = 0.0005`, shock decay 8 business days. They give a 12.1% to 97.5% IV range,
  and the §5.4 checks pass on them (dense in-between check included, no extra intermediate dates were needed).
- **Data size.** The committed story is about 360 KB, not the 150 to 220 KB estimated in §15: `JSON.stringify(doc, null, 2)` puts every number
  on its own line. It is under the 1 MB data limit.
- **`ORBIT_TARGET` y is 0.25** (was 0.35). The fixed extent makes the calm surface sit lower: mean normalised height is about 0.14.
- **`writeHeights` clamps** an IV outside the extent to the edge of the box, so a hand-set `display.iv_range` cannot push the mesh out of the unit box.
- **Autoplay.** The live page starts playing on load. `play()` while paused on the last frame of a non-looping player restarts at 0 (as from `'ended'`).
- **`buildSurfaceGeometry`** is kept as a thin convenience over `buildTopology` + `writeHeights` (used by tests and one-off callers).
- **Export (M3).** `scripts/export/session.ts` (Vite `preview()` plus Playwright) is shared by the CLI and `tests/e2e/export.smoke.ts`.
  `--format frames-json` is parsed but exits 2 with "not implemented yet (M5)". ffmpeg gets `-y` so a stale `.partial` cannot make it
  prompt. The partial file is `<stem>.partial.<ext>` (so ffmpeg still sees `.mp4` or `.gif`); `.gitignore` has `*.partial.*`.
  The CLI reads `playback.fps` from `dist/data` to pick the MP4 fps before the page loads. `npm run test:e2e` builds first.
- **Measured cost** replaced the §15 estimate. The README GIF is `docs/media/demo.gif` (800x450, 25 fps, 375 frames, 3.0 MB).

## Implementation notes (M4)

- **`index.json` has two writers.** `gen:data` and `import:real` each upsert only their own entry (`scripts/lib/indexFile.ts`), so neither
  drops the other's dataset. The synthetic entry is first (the default). The one assertion in `src/synth/generate.test.ts` that pinned
  `index.json` to a single entry now pins only the first entry. No synthetic data or generator code changed.
- **Import script** is `scripts/import-backtester-frames.ts` (`npm run import:real -- --in <path>`). Pure parts: `scripts/import/convert.ts`
  and `args.ts`. The input path is resolved, must be an existing regular `.json` file (not a symlink) under 2 MB. The output names are fixed, so
  nothing in the input chooses a path. There is no subprocess. The source is whitelisted: the date set is exactly the 4 known dates, run ids
  match `[A-Za-z0-9._-]{1,128}`, and the result must pass `parseSequence` before anything is written.
- **Source commit** is recorded as the source file carries it, `35cb682...-dirty`: the file is untracked there. Run ids are in `source.run`
  (a new optional field of the `Sequence` type; the player does not read it).
- **Discrete arbitrage screens** (`src/lib/gridChecks.ts`): calendar on total variance per column, butterfly g from three-point finite
  differences on the k grid (interior strikes only). Report only. The numbers are in DATA.md and pinned by a test.
- **Extrapolated share.** "N% of cells extrapolated" is `round(100 * (1 - quoted_share))`. In a transition it reads "A% → B%" (both ends),
  because the mixed grid has no single share. It is shown in a second overlay line (`.extrap-note`), so it is also in exported frames.
  It is absent when a dataset has no `quoted_share` (the synthetic story).
- **Dataset menu and notice.** A `<select>` built from `index.json` (selecting reloads with `?dataset=<id>`) and a notice built from the
  dataset's own `source`, both outside `#stage` and removed in export mode. The badge, inside the stage, is always on screen.
- **Event pills moved down** (top 66px, was 12px): the long caption "2018-02-05 → 2020-03-16 (interpolated)" ran under the centred pill.
  The README GIF was made before this and still shows the old position.
- **Header band (after M5).** The badge, date caption, extrapolation note and event pill now sit in a fixed-height band at the top of the stage
  (`src/render/stageLayout.ts`: 84, 74 or 96 px by stage width), and the 3D view gets only the area below it. This replaces the absolute
  positions above: at 800x450 the 3-line badge of the real set had covered the top IV axis label. Checked by screenshots at 1280x720, 800x450
  and a 375 px phone viewport, with no box overlap between the overlay and the axis labels.
- **No Cboe or Yahoo number is committed, even in a test.** The committed-file test holds the source's spot and VIX numbers as SHA-256 hashes.
- **Size.** The committed real file is about 43 KB (the §15 estimate of 15 to 25 KB assumed compact rows).

## Implementation notes (M5)

- **`frames-json` format.** `{ schema, schema_version: 1, id, badge, fps, width, height, grid, extent, frames: [{ n, iv, caption, events }] }`.
  `schema`, `schema_version`, `id` and `badge` are added to the §10.7 shape so the Blender script can reject a wrong file and keep the data
  badge on screen. IVs are rounded to 6 dp and the file is compact JSON (real set about 0.8 MB, synthetic about 0.4 MB at 10 fps).
  `exportFramesJson` in `scripts/export/framesJson.ts` is pure (files injected). The CLI path needs no browser, ffmpeg or `dist/`.
  Exit 2 for an unknown dataset or too many frames, 4 for unreadable or invalid data. The file is written as `<stem>.partial.json`, then renamed.
- **Python tooling.** `pyproject.toml` (no build, `package = false`) with `pytest==8.4.2` in a `dev` dependency group, and a committed `uv.lock`.
  `test:py` is `uv run --locked pytest tools/blender`, instead of §4's `--with-requirements tools/blender/requirements-dev.txt`: one pinned
  source, no second file. `verify` is `npm test && npm run build && npm run test:py`.
- **Wireframe.** A WIREFRAME modifier with `material_offset = 1` on the surface object, not a second mesh copy, so the wire follows the shape keys.
- **`--every N`** keeps every Nth baked frame and sets `fps_base = N`, so the duration is unchanged. The suggested N is `ceil(frames / 2000)`.
- **Captions.** Date captions (one text per distinct caption) and event labels (one per distinct label) are text objects parented to the camera,
  keyframed on `hide_render` (`date_caption_keyframes`, `caption_keyframes`). The badge text is always on. Event opacity is not baked (a label is on or off).
- **Cross-language check.** One pytest runs the real exporter (`node scripts/export.ts`, argv list) on both datasets and validates its output with
  `load_frames_doc`. `tests/e2e/export.smoke.ts` compares `frames-json` captions and event pills with what the page shows for six frames.
- **Not verified.** Everything that imports `bpy`: shape-key `foreach_set`, constant keyframe interpolation (set through the preference
  `keyframe_new_interpolation_type`), the shader node graph, text objects, rendering. Blender is not installed here.
