r"""Render an animated implied-vol surface sequence with Blender, from a `frames-json` export.

Adapted from `tools/blender/render_surface_hero.py` of vol-strategy-backtester
(https://github.com/rajib2k5/vol-strategy-backtester, MIT, (c) 2026 Rajib Bahar, commit 35cb682): the
pure half (JSON checks, grid -> vertices, camera maths, engine candidates, argument parsing) and the
Blender-side scene setup (render settings, materials, labels, lights) come from there. New here: the
input is a baked frame sequence, the animation is one shape key per frame, colour comes from height
through shader nodes, and captions are text objects keyframed on `hide_render`.

Make the input with the web project's exporter (timeline and interpolation live only in TypeScript):

    npm run export -- --format frames-json --dataset synthetic-regime-story --out frames.json

Run this script with Blender's own Python:

    blender --background --python tools/blender/render_surface_sequence.py --python-exit-code 1 -- \
        --data frames.json --out-dir out/frames

Everything after the lone `--` belongs to this script; Blender ignores it. PNGs land in --out-dir as
frame_0001.png, frame_0002.png, ... (join them with ffmpeg).

NOT RUN IN BLENDER. Blender was not installed where this was written. The top half of this file is plain
Python that never imports bpy, and pytest covers it (tools/blender/test_render_surface_sequence.py).
The bottom half, every function that imports bpy, has never been executed. Expect to fix small API
differences on first run, and check the first render by eye.

Limits: one shape key per rendered frame, at most MAX_SHAPE_KEYS (2000). Above that the script refuses
and suggests `--every N` (render every Nth baked frame, at 1/N the frame rate, so the duration is kept).
The page's camera orbit (`display.orbit_turns`) is not baked: the Blender camera is fixed.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
from pathlib import Path
from typing import NamedTuple

DEFAULT_SAMPLES = 64
MAX_SIDE_PX = 16384
MAX_SHAPE_KEYS = 2000
MAX_DOC_BYTES = 200_000_000
MAX_FRAMES = 10_000
MAX_TEXT = 200
SCHEMA = "vol-surface-cinema/frames-json"

# The mesh is built in a box of this size (x = k, y = DTE, z = IV on the fixed extent).
DISPLAY_SIZE = (4.0, 4.0, 1.8)
FRAME_START = 1  # Blender's first frame; baked frame n is Blender frame FRAME_START + n

# Camera: azimuth 0 looks along +y from the front; positive swings it to +x.
CAMERA_AZIMUTH_DEG = 38.0
CAMERA_ELEVATION_DEG = 30.0
CAMERA_LENS_MM = 50.0
CAMERA_SENSOR_MM = 36.0
# Content fills at most 1/FRAME_MARGIN of the frame, leaving room for the captions.
FRAME_MARGIN = 1.25
CAPTION_DISTANCE = 10.0

# Three-point rig as suns: name, azimuth, elevation, strength (W/m2), angle (deg).
LIGHT_RIG = (
    ("key", -15.0, 50.0, 3.5, 4.0),
    ("fill", 85.0, 25.0, 1.0, 10.0),
    ("rim", 200.0, 35.0, 2.5, 3.0),
)

BACKGROUND_RGB = (0.015, 0.018, 0.025)
LABEL_RGB = (0.92, 0.93, 0.95)
WIRE_RGB = (0.85, 0.87, 0.90)
WIRE_THICKNESS = 0.008
RAMP_STOPS = 9
# Tried in this order only if the engine enum read at runtime does not list them.
ENGINE_FALLBACKS = ("CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")

# viridis sampled every 1/32 from matplotlib 3.11.0 (Blender ships no matplotlib).
_VIRIDIS = (
    (0.2670, 0.0049, 0.3294), (0.2770, 0.0503, 0.3757), (0.2823, 0.0950, 0.4173),
    (0.2829, 0.1359, 0.4534), (0.2788, 0.1755, 0.4834), (0.2706, 0.2141, 0.5071),
    (0.2590, 0.2515, 0.5247), (0.2450, 0.2877, 0.5373), (0.2297, 0.3224, 0.5457),
    (0.2143, 0.3556, 0.5512), (0.1994, 0.3876, 0.5546), (0.1856, 0.4186, 0.5568),
    (0.1727, 0.4488, 0.5579), (0.1607, 0.4785, 0.5581), (0.1490, 0.5081, 0.5573),
    (0.1378, 0.5375, 0.5549), (0.1276, 0.5669, 0.5506), (0.1206, 0.5964, 0.5436),
    (0.1206, 0.6258, 0.5335), (0.1323, 0.6550, 0.5197), (0.1579, 0.6838, 0.5017),
    (0.1966, 0.7118, 0.4792), (0.2461, 0.7389, 0.4520), (0.3041, 0.7647, 0.4199),
    (0.3692, 0.7889, 0.3829), (0.4401, 0.8111, 0.3410), (0.5160, 0.8312, 0.2943),
    (0.5958, 0.8487, 0.2433), (0.6785, 0.8637, 0.1895), (0.7624, 0.8764, 0.1371),
    (0.8456, 0.8873, 0.0997), (0.9261, 0.8973, 0.1041), (0.9932, 0.9062, 0.1439),
)


# --------------------------------------------------------------------------- #
# Pure Python half: no bpy anywhere above the "Blender side" banner.
# --------------------------------------------------------------------------- #


def _is_number(value) -> bool:
    # bool is an int subclass, and JSON `true` in an IV grid is a bug, not a 1.
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _check_axis(path: str, values, integers: bool = False) -> None:
    if not isinstance(values, list) or len(values) < 2:
        raise ValueError(f"{path} must be a list of at least 2 numbers")
    for i, v in enumerate(values):
        if not _is_number(v):
            raise ValueError(f"{path}[{i}] must be a finite number")
        if integers and (not _is_int(v) or v < 1):
            raise ValueError(f"{path}[{i}] must be an integer >= 1")
    # Strictly increasing keeps every quad non-degenerate and the faces wound the same way.
    if any(b <= a for a, b in zip(values, values[1:])):
        raise ValueError(f"{path} must be strictly increasing")


def validate_frames_doc(doc) -> None:
    """Raise ValueError (naming the path) unless `doc` is a well-formed frames-json document."""
    if not isinstance(doc, dict):
        raise ValueError("frames-json must be an object at the top level")
    if doc.get("schema") != SCHEMA:
        raise ValueError(f"schema must be {SCHEMA!r}")
    if doc.get("schema_version") != 1:
        raise ValueError(f"unsupported schema_version {doc.get('schema_version')!r}: update this script")
    for key in ("id", "badge", "fps", "width", "height", "grid", "extent", "frames"):
        if key not in doc:
            raise ValueError(f"missing key {key!r}")
    if not isinstance(doc["id"], str) or not isinstance(doc["badge"], str) or len(doc["badge"]) > MAX_TEXT:
        raise ValueError(f"id and badge must be strings (badge up to {MAX_TEXT} characters)")
    if not _is_int(doc["fps"]) or not 1 <= doc["fps"] <= 60:
        raise ValueError("fps must be an integer in 1..60")
    for key in ("width", "height"):
        if not _is_int(doc[key]) or not 16 <= doc[key] <= MAX_SIDE_PX:
            raise ValueError(f"{key} must be an integer in 16..{MAX_SIDE_PX}")
    grid = doc["grid"]
    if not isinstance(grid, dict):
        raise ValueError("grid must be an object with k and dte")
    _check_axis("grid.k", grid.get("k"))
    _check_axis("grid.dte", grid.get("dte"), integers=True)
    n_k, n_dte = len(grid["k"]), len(grid["dte"])
    extent = doc["extent"]
    if not (isinstance(extent, list) and len(extent) == 2 and all(_is_number(v) for v in extent) and 0 < extent[0] < extent[1]):
        raise ValueError("extent must be [lo, hi] with 0 < lo < hi")
    frames = doc["frames"]
    if not isinstance(frames, list) or not 1 <= len(frames) <= MAX_FRAMES:
        raise ValueError(f"frames must be a list of 1 to {MAX_FRAMES} frames")
    for t, frame in enumerate(frames):
        at = f"frames[{t}]"
        if not isinstance(frame, dict):
            raise ValueError(f"{at} must be an object")
        if frame.get("n") != t or not _is_int(frame.get("n")):
            raise ValueError(f"{at}.n must equal its position {t}")
        iv = frame.get("iv")
        if not isinstance(iv, list) or len(iv) != n_dte:
            raise ValueError(f"{at}.iv needs one row per dte ({n_dte}); layout is iv[i_dte][j_k]")
        for i, row in enumerate(iv):
            if not isinstance(row, list) or len(row) != n_k:
                raise ValueError(f"{at}.iv[{i}] needs one value per k ({n_k})")
            for j, v in enumerate(row):
                if not _is_number(v) or not 0 < v < 5:
                    raise ValueError(f"{at}.iv[{i}][{j}] must be a finite number with 0 < iv < 5, got {v!r}")
        caption = frame.get("caption")
        if not isinstance(caption, str) or len(caption) > MAX_TEXT:
            raise ValueError(f"{at}.caption must be a string of up to {MAX_TEXT} characters")
        events = frame.get("events")
        if not isinstance(events, list):
            raise ValueError(f"{at}.events must be a list")
        for e, event in enumerate(events):
            ep = f"{at}.events[{e}]"
            if not isinstance(event, dict) or not isinstance(event.get("label"), str) or not 1 <= len(event["label"]) <= MAX_TEXT:
                raise ValueError(f"{ep}.label must be a non-empty string of up to {MAX_TEXT} characters")
            if not _is_number(event.get("opacity")) or not 0 < event["opacity"] <= 1:
                raise ValueError(f"{ep}.opacity must be a number in (0, 1]")


def _reject_constant(name: str):
    raise ValueError(f"{name} is not allowed in JSON")


def load_frames_doc(path: Path) -> dict:
    """Read, size-check, parse and validate a frames-json file."""
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"{path} does not exist or is not a regular file")
    size = path.stat().st_size
    if size > MAX_DOC_BYTES:
        raise ValueError(f"{path} is too large ({size} bytes, limit {MAX_DOC_BYTES})")
    try:
        # parse_constant: refuse the bare NaN / Infinity tokens that Python's own json writer can emit.
        doc = json.loads(path.read_text(encoding="utf-8"), parse_constant=_reject_constant)
    except ValueError as exc:  # JSONDecodeError is a ValueError
        raise ValueError(f"{path} is not valid JSON: {exc}") from None
    validate_frames_doc(doc)
    return doc


def normalise_fixed(value: float, extent) -> float:
    """Map extent[0] -> 0.0 and extent[1] -> 1.0 linearly, clamped to the unit interval (the box never overflows)."""
    lo, hi = extent
    return min(max((value - lo) / (hi - lo), 0.0), 1.0)


def _normalise(values) -> list[float]:
    """Map min -> 0.0 and max -> 1.0 linearly. A constant input maps to all zeros."""
    lo, hi = min(values), max(values)
    span = hi - lo
    if span == 0:
        return [0.0] * len(values)
    return [(v - lo) / span for v in values]


def frame_vertex_heights(doc: dict, n: int) -> list[float]:
    """Height in 0..1 of every vertex of frame n, on the document's fixed IV extent. Vertex index is i_dte * n_k + j_k."""
    frames = doc["frames"]
    if not 0 <= n < len(frames):
        raise IndexError(f"frame {n} is outside [0, {len(frames)})")
    extent = doc["extent"]
    return [normalise_fixed(v, extent) for row in frames[n]["iv"] for v in row]


def frame_vertex_positions(doc: dict, n: int, size=DISPLAY_SIZE) -> list[tuple[float, float, float]]:
    """Vertices of frame n in a box of `size`: x = k, y = DTE (each min -> 0, max -> size), z = fixed-extent IV."""
    xs = _normalise([float(v) for v in doc["grid"]["k"]])
    ys = _normalise([float(v) for v in doc["grid"]["dte"]])
    heights = frame_vertex_heights(doc, n)
    n_k = len(xs)
    sx, sy, sz = size
    return [(xs[idx % n_k] * sx, ys[idx // n_k] * sy, h * sz) for idx, h in enumerate(heights)]


def build_topology(n_k: int, n_dte: int) -> list[tuple[int, int, int, int]]:
    """One quad per grid cell, counter-clockwise seen from +z, so every face normal points up at the camera."""
    return [
        (i * n_k + j, i * n_k + j + 1, (i + 1) * n_k + j + 1, (i + 1) * n_k + j)
        for i in range(n_dte - 1)
        for j in range(n_k - 1)
    ]


class SurfaceMesh(NamedTuple):
    # A NamedTuple, not a dataclass: dataclasses look the module up in sys.modules, which
    # breaks when a test imports this file by path (tools/ is not a package).
    vertices: list[tuple[float, float, float]]  # frame 0
    faces: list[tuple[int, int, int, int]]
    n_k: int
    n_dte: int
    k_range: tuple[float, float]
    dte_range: tuple[float, float]
    iv_range: tuple[float, float]  # the fixed extent, not frame 0's own range
    size: tuple[float, float, float]


def build_sequence_mesh(doc: dict, size=DISPLAY_SIZE) -> SurfaceMesh:
    ks = [float(v) for v in doc["grid"]["k"]]
    dtes = [float(v) for v in doc["grid"]["dte"]]
    return SurfaceMesh(
        vertices=frame_vertex_positions(doc, 0, size),
        faces=build_topology(len(ks), len(dtes)),
        n_k=len(ks),
        n_dte=len(dtes),
        k_range=(ks[0], ks[-1]),
        dte_range=(dtes[0], dtes[-1]),
        iv_range=(float(doc["extent"][0]), float(doc["extent"][1])),
        size=tuple(size),
    )


def subsample_doc(doc: dict, indices: list[int]) -> dict:
    """A copy of `doc` holding only the frames at `indices`, renumbered 0.. so n is the Blender position."""
    frames = [{**doc["frames"][idx], "n": pos} for pos, idx in enumerate(indices)]
    return {**doc, "frames": frames}


def plan_frames(n_frames: int, every: int) -> list[int]:
    """The baked frames to render: every `every`-th, from 0. Refuses more than MAX_SHAPE_KEYS and says what `--every` would fit."""
    if not _is_int(every) or every < 1:
        raise ValueError("--every must be a whole number of at least 1")
    picked = list(range(0, n_frames, every))
    if len(picked) > MAX_SHAPE_KEYS:
        suggest = max(2, math.ceil(n_frames / MAX_SHAPE_KEYS))
        raise ValueError(
            f"{len(picked)} frames would need {len(picked)} shape keys, over the limit of {MAX_SHAPE_KEYS}. "
            f"Try --every {suggest} ({math.ceil(n_frames / suggest)} frames)."
        )
    return picked


def shape_key_schedule(n_frames: int) -> list[list[tuple[int, float]]]:
    """Keyframes of every shape key's value: key k is 1 at frame k and 0 at k-1 and k+1 (CONSTANT interpolation).

    With constant interpolation a value holds until the next key, and before the first key it equals the
    first key's value, so these (at most three) keys leave key k at 1 on frame k only.
    """
    if n_frames < 1:
        raise ValueError("a sequence needs at least 1 frame")
    schedule = []
    for k in range(n_frames):
        keys = []
        if k > 0:
            keys.append((k - 1, 0.0))
        keys.append((k, 1.0))
        if k + 1 < n_frames:
            keys.append((k + 1, 0.0))
        schedule.append(keys)
    return schedule


def _visibility_keyframes(per_frame: list[set]) -> list[tuple[int, str, bool]]:
    """(frame, label, visible) at frame 0 for every label, then at every frame where its visibility changes."""
    labels = sorted(set().union(*per_frame)) if per_frame else []
    keys: list[tuple[int, str, bool]] = []
    for label in labels:
        visible = [label in labels_on for labels_on in per_frame]
        keys.append((0, label, visible[0]))
        for n in range(1, len(visible)):
            if visible[n] != visible[n - 1]:
                keys.append((n, label, visible[n]))
    return sorted(keys, key=lambda key: (key[0], key[1]))


def caption_keyframes(doc: dict) -> list[tuple[int, str, bool]]:
    """Event labels: (frame, label, visible) keys for each label's hide_render, one text object per distinct label."""
    return _visibility_keyframes([{e["label"] for e in f["events"]} for f in doc["frames"]])


def date_caption_keyframes(doc: dict) -> list[tuple[int, str, bool]]:
    """The same for the date caption (a date, or "A -> B (interpolated)"): one text object per distinct caption."""
    return _visibility_keyframes([{f["caption"]} for f in doc["frames"]])


def viridis(t: float) -> tuple[float, float, float]:
    """sRGB colour for t in 0..1 (clamped), interpolated between the _VIRIDIS stops."""
    t = min(max(t, 0.0), 1.0)
    pos = t * (len(_VIRIDIS) - 1)
    i = min(int(pos), len(_VIRIDIS) - 2)
    frac = pos - i
    a, b = _VIRIDIS[i], _VIRIDIS[i + 1]
    return (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac)


def srgb_to_linear(c: float) -> float:
    """Blender does its lighting maths in linear light, but viridis stops are sRGB."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def viridis_stops(count: int = RAMP_STOPS) -> list[tuple[float, tuple[float, float, float, float]]]:
    """(position, linear RGBA) colour-ramp stops from 0 to 1, for the shader's ColorRamp."""
    if count < 2:
        raise ValueError("a colour ramp needs at least 2 stops")
    out = []
    for i in range(count):
        t = i / (count - 1)
        r, g, b = viridis(t)
        out.append((t, (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)))
    return out


class Annotation(NamedTuple):
    text: str
    position: tuple[float, float, float]
    kind: str  # "title" or "tick"


def axis_annotations(surface: SurfaceMesh) -> list[Annotation]:
    """Axis titles plus min/max tick text, placed just outside the box edges. The IV ticks are the fixed extent."""
    sx, sy, sz = surface.size
    tick, title = 0.08 * sx, 0.22 * sx
    k0, k1 = surface.k_range
    d0, d1 = surface.dte_range
    v0, v1 = surface.iv_range
    return [
        Annotation("log-moneyness k", (sx / 2, -title, 0.0), "title"),
        Annotation(f"{k0:+.2f}", (0.0, -tick, 0.0), "tick"),
        Annotation(f"{k1:+.2f}", (sx, -tick, 0.0), "tick"),
        Annotation("days to expiry", (sx + title, sy / 2, 0.0), "title"),
        Annotation(f"{d0:g}d", (sx + tick, 0.0, 0.0), "tick"),
        Annotation(f"{d1:g}d", (sx + tick, sy, 0.0), "tick"),
        Annotation("implied vol", (-title, 0.0, sz / 2), "title"),
        Annotation(f"{v0 * 100:.1f}%", (-tick, 0.0, 0.0), "tick"),
        Annotation(f"{v1 * 100:.1f}%", (-tick, 0.0, sz), "tick"),
    ]


# ----- camera and light maths (pure so the framing can be checked without Blender) -----


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(v):
    n = math.sqrt(_dot(v, v))
    return (v[0] / n, v[1] / n, v[2] / n)


def direction_from_angles(azimuth_deg: float, elevation_deg: float) -> tuple[float, float, float]:
    """Unit vector from the scene centre out towards a camera or light."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))


def look_at_euler(forward) -> tuple[float, float, float]:
    """Blender XYZ Euler for a camera/light whose -Z axis points along `forward`, +Y up-ish."""
    fx, fy, fz = _unit(forward)
    return (math.acos(max(-1.0, min(1.0, -fz))), 0.0, math.atan2(-fx, fy))


def camera_fov(lens_mm: float, sensor_width_mm: float, aspect: float) -> tuple[float, float]:
    """(horizontal, vertical) field of view in radians, with the sensor fitted to the width."""
    hfov = 2 * math.atan(sensor_width_mm / (2 * lens_mm))
    return hfov, 2 * math.atan(math.tan(hfov / 2) / aspect)


def box_corners(size) -> list[tuple[float, float, float]]:
    return [(x * size[0], y * size[1], z * size[2]) for x, y, z in itertools.product((0, 1), repeat=3)]


def fit_camera_distance(points, target, direction, hfov, vfov, margin=FRAME_MARGIN) -> float:
    """Smallest distance (to within 2%) from `target` along `direction` that frames every point."""
    forward = tuple(-c for c in direction)
    right = _cross(forward, (0.0, 0.0, 1.0))
    right = _unit(right) if _dot(right, right) > 1e-12 else (1.0, 0.0, 0.0)
    up = _cross(right, forward)
    tan_h, tan_v = math.tan(hfov / 2), math.tan(vfov / 2)

    def fits(dist: float) -> bool:
        cam = tuple(t + d * dist for t, d in zip(target, direction))
        for p in points:
            v = (p[0] - cam[0], p[1] - cam[1], p[2] - cam[2])
            depth = _dot(v, forward)
            if depth <= 0:
                return False
            if abs(_dot(v, right)) / depth * margin > tan_h or abs(_dot(v, up)) / depth * margin > tan_v:
                return False
        return True

    dist = 1.0
    for _ in range(2000):
        if fits(dist):
            return dist
        dist *= 1.02
    raise ValueError("could not frame the scene at any camera distance")


def engine_candidates(available) -> list[str]:
    """Render engines to try in order: Cycles, then any EEVEE flavour (newest first), then known names.

    Cycles goes first even if `available` does not list it: the enum under-reports (Cycles is an
    add-on), and the caller assigns each candidate inside try/except TypeError.
    """
    order = ["CYCLES"]
    order += sorted((e for e in available if "EEVEE" in e), reverse=True)
    order += [e for e in ENGINE_FALLBACKS if e not in order]
    return order


# ----- command line -----


def script_args(argv) -> list[str]:
    """The part of argv after the first `--`; Blender keeps its own flags before it."""
    return list(argv[argv.index("--") + 1 :]) if "--" in argv else []


def parse_resolution(text: str) -> tuple[int, int]:
    """'1920x1080' -> (1920, 1080)."""
    try:
        width_text, height_text = text.lower().split("x")
        width, height = int(width_text), int(height_text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"resolution must look like 1920x1080, got {text!r}") from None
    if not (1 <= width <= MAX_SIDE_PX and 1 <= height <= MAX_SIDE_PX):
        raise argparse.ArgumentTypeError(f"resolution sides must be 1..{MAX_SIDE_PX}, got {text!r}")
    return width, height


def _positive_int(text: str) -> int:
    try:
        value = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"expected a whole number, got {text!r}") from None
    if value < 1:
        raise argparse.ArgumentTypeError(f"must be at least 1, got {value}")
    return value


def _json_path(text: str) -> Path:
    path = Path(text)
    if path.suffix.lower() != ".json":
        raise argparse.ArgumentTypeError(f"--data must be a .json file, got {text!r}")
    return path


def parse_args(args: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="blender --background --python tools/blender/render_surface_sequence.py --",
        description="Render an animated implied-vol surface from a frames-json export.",
    )
    parser.add_argument("--data", type=_json_path, required=True, help="frames-json from `npm run export -- --format frames-json`")
    parser.add_argument("--out-dir", type=Path, required=True, help="folder for frame_0001.png, ... (created if missing)")
    parser.add_argument("--samples", type=_positive_int, default=DEFAULT_SAMPLES, help="render samples (default: %(default)s)")
    parser.add_argument("--resolution", type=parse_resolution, default=None, metavar="WxH", help="image size (default: the file's width x height)")
    parser.add_argument("--every", type=_positive_int, default=1, help="render every Nth baked frame, at 1/N the frame rate (default: %(default)s)")
    return parser.parse_args(args)


# --------------------------------------------------------------------------- #
# Blender side: every function below imports bpy itself, so importing this
# module in a normal Python never touches it. NONE OF THIS HAS RUN YET.
# --------------------------------------------------------------------------- #


def clear_scene() -> None:
    """Empty the startup scene (cube, light, camera) so only our objects get rendered."""
    import bpy

    # The data API instead of bpy.ops.object.delete: ops need a UI context, and --background has none.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block_set in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves, bpy.data.shape_keys):
        for block in list(block_set):
            block_set.remove(block)


def configure_render(scene, out_dir: Path, samples: int, resolution: tuple[int, int], n_frames: int, fps: int, every: int) -> str:
    """Pick the engine, set samples, size, PNG output and the frame range. Returns the engine used."""
    import bpy

    available = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    last_error = None
    for engine in engine_candidates(available):
        try:
            scene.render.engine = engine
            break
        except TypeError as exc:  # engine unknown or its add-on disabled; the message lists valid ones
            last_error = exc
    else:
        raise RuntimeError(f"no usable render engine (tried {engine_candidates(available)}): {last_error}")

    if engine == "CYCLES":
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    else:
        scene.eevee.taa_render_samples = samples

    formats = [i.identifier for i in bpy.types.ImageFormatSettings.bl_rna.properties["file_format"].enum_items]
    if "PNG" not in formats:
        raise RuntimeError(f"this Blender has no PNG output; it offers {formats}")
    scene.render.image_settings.file_format = "PNG"
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_dir.resolve() / "frame_")  # Blender appends the 4-digit frame number
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100

    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_START + n_frames - 1
    # fps / fps_base is the frame rate: rendering every Nth frame at 1/N the rate keeps the duration.
    scene.render.fps = fps
    scene.render.fps_base = float(every)

    try:
        scene.view_settings.view_transform = "Standard"  # Blender 4 defaults to AgX, which desaturates
    except TypeError:
        pass
    try:
        # New keyframes default to CONSTANT, so shape-key values step instead of blending between frames.
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "CONSTANT"
    except (AttributeError, TypeError):
        print("render_surface_sequence: could not set constant keyframe interpolation; check the shape-key F-curves", file=sys.stderr)
    return engine


def _node_by_type(tree, node_type: str, bl_idname: str):
    # Look nodes up by .type, never by name: node names are localised.
    node = next((n for n in tree.nodes if n.type == node_type), None)
    return node if node is not None else tree.nodes.new(bl_idname)


def _height_color_material(name: str, size_z: float):
    """Principled surface coloured by object-space height: Geometry -> Separate XYZ -> Map Range (fixed extent) -> ColorRamp.

    Vertex colours cannot be shape-keyed, so the colour is computed from position in the shader. The
    surface object has an identity transform, so Geometry's world-space Position is its object space.
    """
    import bpy

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = _node_by_type(tree, "BSDF_PRINCIPLED", "ShaderNodeBsdfPrincipled")
    output = _node_by_type(tree, "OUTPUT_MATERIAL", "ShaderNodeOutputMaterial")
    if not bsdf.outputs["BSDF"].is_linked:
        tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.45

    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    map_range = tree.nodes.new("ShaderNodeMapRange")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    tree.links.new(geometry.outputs["Position"], separate.inputs["Vector"])
    tree.links.new(separate.outputs["Z"], map_range.inputs["Value"])
    map_range.clamp = True
    map_range.inputs["From Min"].default_value = 0.0
    map_range.inputs["From Max"].default_value = size_z
    map_range.inputs["To Min"].default_value = 0.0
    map_range.inputs["To Max"].default_value = 1.0
    tree.links.new(map_range.outputs["Result"], ramp.inputs["Fac"])

    stops = viridis_stops()
    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for element, (position, rgba) in zip(elements, stops):
        element.position = position
        element.color = rgba
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _emission_material(name: str, rgb, strength: float):
    """Flat self-lit colour: labels and wire stay crisp whatever the lights do."""
    import bpy

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    emission = tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*rgb, 1.0)
    emission.inputs["Strength"].default_value = strength
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat


def set_background(scene) -> None:
    import bpy

    world = bpy.data.worlds.new("sequence_world")
    world.use_nodes = True
    background = _node_by_type(world.node_tree, "BACKGROUND", "ShaderNodeBackground")
    background.inputs["Color"].default_value = (*BACKGROUND_RGB, 1.0)
    background.inputs["Strength"].default_value = 1.0
    scene.world = world


def add_surface(scene, sequence_doc: dict, surface: SurfaceMesh) -> None:
    """One mesh, one shape key per frame (value 1 on its own frame only), height-coloured, with a wireframe on top."""
    import bpy

    mesh = bpy.data.meshes.new("surface_mesh")
    mesh.from_pydata(surface.vertices, [], surface.faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    # Slot 0 colours the surface; slot 1 is the wire (the wireframe modifier shifts its strips by material_offset).
    mesh.materials.append(_height_color_material("surface_height_colors", surface.size[2]))
    mesh.materials.append(_emission_material("surface_wire", WIRE_RGB, 0.6))
    obj = bpy.data.objects.new("surface", mesh)
    scene.collection.objects.link(obj)

    modifier = obj.modifiers.new("wireframe", "WIREFRAME")
    modifier.thickness = WIRE_THICKNESS
    modifier.offset = 1.0
    modifier.use_replace = False
    modifier.use_even_offset = True
    modifier.material_offset = 1

    n_frames = len(sequence_doc["frames"])
    obj.shape_key_add(name="Basis", from_mix=False)
    keys = []
    for n in range(n_frames):
        key = obj.shape_key_add(name=f"frame_{n:05d}", from_mix=False)
        key.data.foreach_set("co", [c for p in frame_vertex_positions(sequence_doc, n, surface.size) for c in p])
        key.value = 0.0
        keys.append(key)
    for key, schedule in zip(keys, shape_key_schedule(n_frames)):
        for frame, value in schedule:
            key.value = value
            key.keyframe_insert(data_path="value", frame=FRAME_START + frame)


def add_camera(scene, surface: SurfaceMesh, resolution: tuple[int, int]):
    """3/4-view camera whose distance is fitted so the box and its labels fill the frame."""
    import bpy

    cam_data = bpy.data.cameras.new("sequence_camera")
    cam_data.lens = CAMERA_LENS_MM
    cam_data.sensor_width = CAMERA_SENSOR_MM
    cam_data.sensor_fit = "HORIZONTAL"

    target = tuple(s / 2 for s in surface.size)
    direction = direction_from_angles(CAMERA_AZIMUTH_DEG, CAMERA_ELEVATION_DEG)
    hfov, vfov = camera_fov(CAMERA_LENS_MM, CAMERA_SENSOR_MM, resolution[0] / resolution[1])
    points = box_corners(surface.size) + [a.position for a in axis_annotations(surface)]
    dist = fit_camera_distance(points, target, direction, hfov, vfov)
    cam_data.clip_end = dist * 4

    cam = bpy.data.objects.new("sequence_camera", cam_data)
    cam.location = tuple(t + d * dist for t, d in zip(target, direction))
    cam.rotation_euler = look_at_euler(tuple(-d for d in direction))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam, hfov, vfov


def _add_text(scene, name: str, body: str, location, size: float, material, rotation, parent=None):
    import bpy

    curve = bpy.data.curves.new(name=name, type="FONT")
    curve.body = body
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    obj.location = location
    obj.rotation_euler = rotation
    if parent is not None:
        obj.parent = parent
    scene.collection.objects.link(obj)
    return obj


def _key_hide_render(obj, keys) -> None:
    """Keyframe hide_render from (frame, label, visible) keys of one label."""
    for frame, _label, visible in keys:
        obj.hide_render = not visible
        obj.keyframe_insert(data_path="hide_render", frame=FRAME_START + frame)


def add_labels(scene, sequence_doc: dict, surface: SurfaceMesh, cam, hfov: float, vfov: float) -> None:
    """Axis text (static), the badge (always on), and the date and event captions, hidden or shown per frame."""
    material = _emission_material("label_text", LABEL_RGB, 1.0)
    sizes = {"title": 0.075 * surface.size[0], "tick": 0.055 * surface.size[0]}
    facing = tuple(cam.rotation_euler)
    for idx, note in enumerate(axis_annotations(surface)):
        _add_text(scene, f"axis_{idx}", note.text, note.position, sizes[note.kind], material, facing)

    # Captions are parented to the camera, so they sit at a fixed spot in the frame whatever the fitted distance is.
    half_h = CAPTION_DISTANCE * math.tan(vfov / 2)
    half_w = CAPTION_DISTANCE * math.tan(hfov / 2)

    def fitted_size(text: str, base: float) -> float:
        # Cap by width too (about 0.62 em per character), so a long label never overflows the frame.
        return min(base, 0.85 * 2 * half_w / (0.62 * max(1, len(text))))

    badge = sequence_doc["badge"]
    _add_text(scene, "badge", badge, (0.0, -0.9 * half_h, -CAPTION_DISTANCE), fitted_size(badge, 0.05 * half_h), material, (0.0, 0.0, 0.0), parent=cam)

    for stream, y, base, prefix in (
        (date_caption_keyframes(sequence_doc), 0.9 * half_h, 0.075 * half_h, "date"),
        (caption_keyframes(sequence_doc), 0.78 * half_h, 0.06 * half_h, "event"),
    ):
        by_label: dict[str, list[tuple[int, str, bool]]] = {}
        for key in stream:
            by_label.setdefault(key[1], []).append(key)
        for idx, (label, keys) in enumerate(sorted(by_label.items())):
            obj = _add_text(scene, f"{prefix}_{idx}", label, (0.0, y, -CAPTION_DISTANCE), fitted_size(label, base), material, (0.0, 0.0, 0.0), parent=cam)
            _key_hide_render(obj, keys)


def add_lights(scene, target) -> None:
    """Key / fill / rim. Key models the shape, fill lifts the shadows, rim separates it from the background."""
    import bpy

    for name, azimuth, elevation, strength, angle in LIGHT_RIG:
        direction = direction_from_angles(azimuth, elevation)
        light = bpy.data.lights.new(name=name, type="SUN")
        light.energy = strength
        light.angle = math.radians(angle)
        obj = bpy.data.objects.new(name, light)
        obj.rotation_euler = look_at_euler(tuple(-d for d in direction))
        obj.location = tuple(t + d * 10 for t, d in zip(target, direction))
        scene.collection.objects.link(obj)


def render_sequence(doc: dict, indices: list[int], out_dir: Path, samples: int, resolution: tuple[int, int], every: int) -> None:
    import bpy

    sequence_doc = subsample_doc(doc, indices)
    surface = build_sequence_mesh(sequence_doc, DISPLAY_SIZE)
    clear_scene()
    scene = bpy.context.scene
    engine = configure_render(scene, out_dir, samples, resolution, len(indices), doc["fps"], every)
    set_background(scene)
    add_surface(scene, sequence_doc, surface)
    cam, hfov, vfov = add_camera(scene, surface, resolution)
    add_labels(scene, sequence_doc, surface, cam, hfov, vfov)
    add_lights(scene, tuple(s / 2 for s in surface.size))
    print(
        f"render_surface_sequence: engine={engine} samples={samples} size={resolution[0]}x{resolution[1]} "
        f"frames={len(indices)} (every {every}) fps={doc['fps']}/{every} -> {out_dir}"
    )
    bpy.ops.render.render(animation=True)


def main(argv=None) -> None:
    args = parse_args(script_args(sys.argv if argv is None else argv))
    try:
        doc = load_frames_doc(args.data)
        indices = plan_frames(len(doc["frames"]), args.every)
    except ValueError as exc:
        print(f"render_surface_sequence: {exc}", file=sys.stderr)
        raise SystemExit(2) from None
    resolution = args.resolution or (doc["width"], doc["height"])
    print(f"render_surface_sequence: {args.data} id={doc['id']} grid={len(doc['grid']['dte'])} dte x {len(doc['grid']['k'])} k, {len(doc['frames'])} baked frames")
    render_sequence(doc, indices, args.out_dir, args.samples, resolution, args.every)


if __name__ == "__main__":
    main()
