# Credits

Copied and adapted from [vol-strategy-backtester](https://github.com/rajib2k5/vol-strategy-backtester)
(MIT, © 2026 Rajib Bahar), commit `35cb682`. Each adapted file carries a credit comment at its top.

| File here | Source path (in `app/src`) | Change |
|---|---|---|
| `src/lib/surfaceGeometry.ts` (+ test) | `lib/surfaceGeometry.ts` | split into `buildTopology` and `writeHeights`, fixed IV extent passed in, `.ts` imports |
| `src/lib/surfaceScene.ts` (+ test) | `lib/surfaceScene.ts` | `.ts` imports, `ORBIT_TARGET` re-tuned for the fixed extent |
| `src/lib/colorRamp.ts` (+ test) | `lib/colorRamp.ts` | ramp replaced by viridis (below); comment about tone mapping |
| `src/lib/framing.ts` (+ test) | `lib/framing.ts` | none |
| `src/lib/labelProjection.ts` (+ test) | `lib/labelProjection.ts` | none |
| `src/lib/format.ts` (+ test) | `lib/format.ts` | dropped `compact` and `bps` (unused) |
| `src/render/webgl.ts` (+ test) | `views/webgl.ts` | none |
| `src/render/scene.ts` | `views/SurfaceHero.tsx` | scene setup re-expressed in plain three.js (no React, no r3f) |
| `src/render/heatmap.ts` | `lib/charts.tsx` Heatmap | rewrite as a 2D canvas, not a copy |
| `tools/blender/render_surface_sequence.py` | `tools/blender/render_surface_hero.py` | pure half and Blender scene setup reused; animation by shape keys, height colour by shader nodes, captions by `hide_render` keys (new). Never run in Blender |
| `src/render/controls.ts` | frame-picker idea in `views/SurfacePage.tsx` | rewrite |

Real dataset (`public/data/optionsdx-spy-4dates.json`): implied-vol grids computed by the pricing build of the same
repository from OptionsDX quotes (via Kaggle), imported by `scripts/import-backtester-frames.ts`. Terms and limits: [DATA.md](DATA.md).

The SSVI formulation follows `src/volbt/illustrative.py` in the same repository, and Gatheral and Jacquier,
"Arbitrage-free SVI volatility surfaces" (2014).

Colour ramp: [viridis](https://bids.github.io/colormap/) from matplotlib (CC0, by Nathaniel Smith and Stefan van der Walt),
sampled every 1/32 from matplotlib 3.11.0. The same 33 stops are in `src/lib/colorRamp.ts` and `tools/blender/render_surface_sequence.py`.

Fonts: the page uses the system font stack. No font is loaded from a network and none is bundled.
