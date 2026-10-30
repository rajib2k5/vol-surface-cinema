# vol-surface-cinema

An animated 3D implied-volatility surface that plays date by date, for slide decks and social posts.
The default demo is a synthetic SSVI surface with a fictional regime story (calm, volatility spike, FOMC, recovery).

![demo](docs/media/demo.gif)

Page: play, pause, scrub, jump to a date or event. Export: deterministic headless GIF or MP4. The page works offline:
no font or script is loaded from a network.

## Run

    npm install
    npm run dev       # http://localhost:5173
    npm run build     # static site in dist/ (base './')
    npm run verify    # tests + typecheck + build

Keys: Space plays or pauses, Left and Right step one frame.

## Export (GIF or MP4)

One-time setup: `npx playwright install chromium`. ffmpeg comes from your package manager (or set `FFMPEG` to its path).

    npm run export -- --format mp4 --dataset synthetic-regime-story --out demo.mp4
    npm run export -- --format gif --dataset synthetic-regime-story --out demo.gif

Options: `--fps N` (1..60; GIF: 10, 20, 25 or 50), `--size WxH` (even, 16..4096; default 1280x720 MP4, 800x450 GIF),
`--force` (overwrite), `--max-frames N` (default 10000), `--gpu` (use the GPU instead of SwiftShader).
Exit codes: 2 bad arguments, 3 ffmpeg or browser or build missing, 4 render failure, 5 encode failure.

Frame `n` depends only on (dataset, n, fps, size). Re-running gives the same PNG frames on the same machine;
the MP4 and GIF bytes are not promised to be identical.
Measured here (SwiftShader, 20 cores): 0.17 s per frame at 1280x720 and at 800x450, so the 450-frame story takes about 75 s as MP4.

## Tests

    npm run test:py   # pytest, pure half of the Blender script (needs uv)
    npm test          # vitest: timeline, interpolation, SSVI arbitrage checks, contract, export helpers
    npm run test:e2e  # Playwright + ffmpeg smoke test of the export pipeline (needs the setup above)
    npm run gen:data  # regenerate public/data/synthetic-regime-story.json (a drift test pins it)

## Data

`public/data/index.json` lists the datasets; `?dataset=<id>` must match an id in it. The format is
`surface-sequence` v1 (see `docs/design.md` §7). The synthetic story is generated from a seeded SSVI model
(`src/synth`), checked against Gatheral and Jacquier's no-arbitrage conditions, and committed.

## Real dataset (optional)

`public/data/optionsdx-spy-4dates.json` holds SPY implied-vol grids for four real dates (2017-11-03, 2018-02-05, 2020-03-16, 2023-06-15),
derived from OptionsDX end-of-day quotes via Kaggle. It is not the default and **is not covered by the MIT licence**: read [DATA.md](DATA.md).
Pick it from the dataset menu or open `?dataset=optionsdx-spy-4dates`. The four dates are months to years apart, so every frame between
them is interpolated, not observed, and the caption says so. The page shows the share of cells that were extrapolated. The grids are shown
as exported: they have butterfly violations on a finite-difference screen (DATA.md has the numbers).

    npm run import:real -- --in <path to vol-strategy-backtester/app/public/data/surface_frames.json>   # one-off, read only

## Blender (optional, not yet run in Blender)

`tools/blender/render_surface_sequence.py` renders the animation in Blender as a PNG sequence, one shape key per frame.
**It has never been run in Blender**: Blender is not installed where it was written. Only its pure half (JSON checks, frame to
vertex heights, caption and shape-key schedules, camera maths, arguments) is tested, by pytest, without bpy. The Blender-side functions
are untested. Expect small API fixes on the first run and look at the first frames by eye.

The page, the export CLI and Blender share one timeline: the exporter bakes every frame's IV grid, caption and events to JSON, and
the Blender script only reads that.

    npm run export -- --format frames-json --dataset synthetic-regime-story --out frames.json
    blender --background --python tools/blender/render_surface_sequence.py --python-exit-code 1 -- \
        --data frames.json --out-dir out/frames            # PNGs frame_0001.png, ...; join them with ffmpeg

Options: `--every N` (render every Nth baked frame at 1/N the frame rate), `--samples N`, `--resolution WxH`.
The script refuses more than 2000 frames (one shape key each) and suggests the `--every` that fits. The page's camera orbit is not baked.
The Python tests need [uv](https://docs.astral.sh/uv/): `npm run test:py` (part of `npm run verify`).

## Docs

`docs/design.md` is the build spec, `docs/adr/0001-architecture.md` the decisions, `CREDITS.md` the copied code.
Licence: MIT.
