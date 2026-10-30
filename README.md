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

    npm test          # vitest: timeline, interpolation, SSVI arbitrage checks, contract, export helpers
    npm run test:e2e  # Playwright + ffmpeg smoke test of the export pipeline (needs the setup above)
    npm run gen:data  # regenerate public/data/synthetic-regime-story.json (a drift test pins it)

## Data

`public/data/index.json` lists the datasets; `?dataset=<id>` must match an id in it. The format is
`surface-sequence` v1 (see `docs/design.md` §7). The synthetic story is generated from a seeded SSVI model
(`src/synth`), checked against Gatheral and Jacquier's no-arbitrage conditions, and committed.

## Docs

`docs/design.md` is the build spec, `docs/adr/0001-architecture.md` the decisions, `CREDITS.md` the copied code.
Licence: MIT.
