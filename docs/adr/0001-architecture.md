# ADR 0001: v0.1 architecture of vol-surface-cinema

- Status: proposed
- Date: 2026-10-29
- Deciders: owner (quant developer). Drafted by design agent.
- Detail: [`../design.md`](../design.md)

## Context

The project plays an animated implied-vol surface date by date in a browser. It exports the same animation to GIF and MP4 headless,
and it can also be rendered in Blender. Existing code is in vol-strategy-backtester (public, MIT): a React + @react-three/fiber hero,
pure geometry helpers with tests, and a Blender still-render script. The real surface data there has redistribution limits
(Cboe VIX closes, Yahoo closes, OptionsDX-derived IVs with unknown vendor terms). Blender is not installed on the
build machine.

## Decisions

### 1. Plain three.js + vanilla TypeScript, not React + r3f

The pure helpers (`surfaceGeometry`, `surfaceScene`, `colorRamp`, `framing`, `labelProjection`, `format`) and
their tests do not depend on React. They are copied unchanged or with small adaptations. Only `SurfaceHero.tsx` and its two
r3f-renderer tests are lost, and they are about 230 lines of glue.

Reasons:
- **Deterministic export.** `renderFrame(n)` must apply a state, draw, and resolve once the frame is on the canvas. With plain
  three, this is a direct `renderer.render()` call. With r3f, state goes through the React reconciler and the r3f frameloop
  (`flushSync` + `advance()`), which adds one more async layer that can drift between "committed" and "drawn".
- **Bundle.** Measured with esbuild minify and gzip -9 on the source repo's pinned versions: a three subset plus OrbitControls is 138 KB gz.
  With react-dom + r3f (+drei) it is 314 KB gz. The page is a single-view player and has no use for a component tree.
- **Testability.** The tests target pure modules in both stacks. Vanilla removes the need for `@react-three/test-renderer`.

Rejected: **keep React + r3f**. It would win if the player must embed into the backtester's React app, or if the UI grows
into a multi-view app with routing and shared state.
Rejected: **raw WebGL / regl**. It would lose the copied scene code for no gain at 286 vertices.

### 2. Synthetic default data: SSVI, generated offline by a seeded TS script, committed as JSON

Each date is an SSVI surface `(θ_t(T), ρ_t, η_t)` with `φ(θ) = η θ^(−1/2)(1+θ)^(−1/2)`. ρ_t and η_t are constant across T within a
date.

Calendar freedom (GJ Thm 4.1) needs two things, and each comes from a different place:
- θ_t non-decreasing in T. This comes by construction from a positive forward variance.
- `0 ≤ ∂_θ(θφ) ≤ (1+√(1−ρ²))φ/ρ²`. This is a property of the chosen φ: it holds for every θ and every |ρ| ≤ 1. Positive forward
  variance alone does not give it.

Butterfly freedom (GJ Thm 4.2, sufficient) comes from the clamp `η(1+|ρ|) ≤ 2`, which implies both `θφ(1+|ρ|) < 4` and
`θφ²(1+|ρ|) ≤ 4`. Tests check `g(k) ≥ 0` directly with analytic derivatives. A known-bad control (η(1+|ρ|) = 5, θ = 0.02,
measured min g = −0.108) proves the check can fail.

The regime story (calm → volatility spike → FOMC event variance → recovery) is data in `story.ts`, on fictional 2030 dates. IVs are
rounded to 6 dp and the JSON is committed. A test regenerates it and requires an exact match.

Rejected: **raw SVI per slice with time-varying (a, b, ρ, m, σ)**. Calendar freedom across slices is a pairwise
condition that the generator would have to repair. It wins only if we need per-expiry shapes that SSVI cannot make.
Rejected: **generating in the browser at runtime**. The export CLI, the page, and Blender must read identical numbers, and Blender
cannot run TS. A committed file is also reviewable. Runtime generation wins only if users must tune the story live.
Rejected: **a Python generator**. It would add a second toolchain to the main path for one script.

### 3. Interpolate per cell, linearly in total variance w = σ²T, with easing on α

Calendar monotonicity is preserved, because a convex combination of functions that increase in T increases in T. Butterfly is not guaranteed in general.
Measured: 0 violations in 300 random SSVI pairs × 21 α. The committed story is tested on a dense grid of 101 α values in [0, 1] for
every adjacent pair of dates. The wrap pair (last → first) is tested too, because a looping timeline interpolates across the wrap. If a
story fails, add intermediate dates. The same rule works for the real grids, where no parameters exist.

Rejected: **linear in IV**. It is not calendar-safe. Rejected: **interpolating SSVI parameters**. It is SSVI-only, and linear η and ρ can
break `η(1+|ρ|) ≤ 2` mid-way.

### 4. Integer frame index is the only clock

A pure `timeline` maps frame `n` to `(i, j, α, phase)`. Date i is held for `1 + h_i` frames, followed by `F−1` in-between frames.
Optionally, the sequence loops with a wrap transition. Event holds and annotation windows are in frames. Camera orbit and annotation
fades are functions of n. The live player only turns wall-clock time into n.

Rejected: **a seconds-based continuous timeline with CSS fades**. It cannot reproduce frame n headless.

### 5. Export: Playwright drives `window.__cinema.renderFrame(n)`, stage screenshots are piped to ffmpeg stdin

Chromium headless uses forced SwiftShader. It was measured to give WebGL2 on chromium-1234 here. Playwright 1.62.0 matches that
revision. Screenshots are taken of the stage element, so DOM overlays are included. ffmpeg runs from argv arrays with `shell: false`. MP4 uses H.264 yuv420p with
even sizes enforced as an error, not a silent rescale. GIF is made in one pass with palettegen/paletteuse, with fps restricted to divisors of 100.
Output is written to `.partial` and renamed only on success.

Rejected: **`canvas.toDataURL` capture**. It misses the DOM overlays. Rejected: **writing a PNG directory and then encoding**. It uses disk and adds a cleanup
step, but it is kept as a possible debug flag. Rejected: **WebCodecs/MediaRecorder in the page**. It is real-time and not frame-exact, and it gives no GIF.

### 6. Blender consumes baked frames (`export --format frames-json`), one shape key per frame

Timeline and interpolation logic then exist once, in TS. Colour comes from height through shader nodes, because vertex colours cannot be
shape-keyed. Only the pure Python half is tested (pytest via uv). bpy is untested because Blender is absent.

Rejected: **porting timeline and interpolation to Python**. Two implementations would drift. Rejected: **shape keys per date with Blender's
own interpolation**. It would interpolate heights (IV), not w, and the result would not match the web output.

### 7. Ship the 4 real OptionsDX-derived IV grids as an optional, non-default dataset

An import script keeps only what the player uses: dates, IV grids, cell flags, quoted share, and run ids. `spot` (Yahoo) and
`vix_close` (Cboe) are not imported. Labels and events name events in words only. DATA.md names every source and its terms.
During transitions the caption says the in-between frames are interpolated across months or years.

Reason: the owner's policy allows small derived series to be committed with a notice that names each source and its terms.

Stated plainly:
- This is the first commit of these values anywhere. `surface_frames.json` is untracked in vol-strategy-backtester.
- This repo is private. The owner decides whether and when it becomes public.

Rejected: **omitting the real data**. That is safer, but the project loses its only "this happened" demo. Omitting would win if
the owner rules derived OptionsDX values out. The file would then be removed going forward with a normal commit. History is never
rewritten.

## Consequences

- One JS toolchain for app, generator, and CLI. Python only for the optional Blender script.
- Determinism is a rule every contributor must keep: nothing visual may depend on wall-clock time in export mode.
- **The owner decides** whether the repo becomes public with the derived OptionsDX grids in it. Git history is never rewritten,
  so once the file is committed it stays in history. Going public is therefore the one hard-to-reverse step.

## Revisit when

- An embed into a React app is required (decision 1).
- A synthetic story fails the in-between butterfly test even with finer dates (decision 3).
- Measured SwiftShader export exceeds about 1 s/frame (decision 5: default to `--gpu`).
- Data terms change, or the owner rules against the derived OptionsDX values (decision 7).
