"""Tests for the pure half of render_surface_sequence.py.

Blender is not installed on the machine this was written on, so nothing that needs `bpy` is tested here:
the Blender-side functions have never run. These tests import the module in an ordinary Python and check
that doing so does not import bpy.
"""

from __future__ import annotations

import copy
import importlib.util
import math
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("render_surface_sequence.py")
# tools/ is not a package, so load by path. Register in sys.modules first (NamedTuple needs it).
_spec = importlib.util.spec_from_file_location("render_surface_sequence", SCRIPT)
rss = importlib.util.module_from_spec(_spec)
sys.modules["render_surface_sequence"] = rss
_spec.loader.exec_module(rss)


def make_doc(n_frames: int = 4) -> dict:
    """A tiny frames-json document: 2 expiries x 3 strikes, fixed extent 0.10..0.50."""
    frames = []
    for n in range(n_frames):
        base = 0.10 + 0.10 * n  # frame n lifts every IV by 0.1 per frame, so heights are easy to check
        frames.append(
            {
                "n": n,
                "iv": [[base, base + 0.05, base], [base + 0.02, base + 0.07, base + 0.02]],
                "caption": "2030-01-02" if n < 2 else "2030-01-02 → 2030-02-20 (interpolated)",
                "events": [{"label": "Spike", "opacity": 1.0}] if n in (1, 2) else [],
            }
        )
    return {
        "schema": "vol-surface-cinema/frames-json",
        "schema_version": 1,
        "id": "tiny",
        "badge": "Synthetic data, not market data.",
        "fps": 30,
        "width": 640,
        "height": 360,
        "grid": {"k": [-0.1, 0.0, 0.1], "dte": [7, 30]},
        "extent": [0.10, 0.50],
        "frames": frames,
    }


# ---- import hygiene -------------------------------------------------------------------------------


def test_importing_the_script_does_not_import_bpy():
    assert "bpy" not in sys.modules


# ---- validate_frames_doc --------------------------------------------------------------------------


def test_validate_accepts_a_good_document():
    rss.validate_frames_doc(make_doc())


def _mut(fn):
    doc = make_doc()
    fn(doc)
    return doc


BAD_DOCS = {
    "not an object": lambda d: [],
    "wrong schema": lambda d: d.update(schema="other"),
    "unknown version": lambda d: d.update(schema_version=2),
    "missing extent": lambda d: d.pop("extent"),
    "missing frames": lambda d: d.pop("frames"),
    "fps zero": lambda d: d.update(fps=0),
    "fps not an int": lambda d: d.update(fps=30.5),
    "fps a bool": lambda d: d.update(fps=True),
    "width too small": lambda d: d.update(width=2),
    "badge not a string": lambda d: d.update(badge=3),
    "k not increasing": lambda d: d["grid"].update(k=[0.1, 0.0, -0.1]),
    "dte too short": lambda d: d["grid"].update(dte=[7]),
    "dte has NaN": lambda d: d["grid"].update(dte=[7, float("nan")]),
    "extent reversed": lambda d: d.update(extent=[0.5, 0.1]),
    "extent not positive": lambda d: d.update(extent=[0.0, 0.5]),
    "no frames": lambda d: d.update(frames=[]),
    "frame n out of order": lambda d: d["frames"][2].update(n=7),
    "iv missing a row": lambda d: d["frames"][1]["iv"].pop(),
    "iv ragged row": lambda d: d["frames"][1]["iv"][0].pop(),
    "iv NaN": lambda d: d["frames"][0]["iv"][0].__setitem__(0, float("nan")),
    "iv infinity": lambda d: d["frames"][0]["iv"][0].__setitem__(0, float("inf")),
    "iv true": lambda d: d["frames"][0]["iv"][0].__setitem__(0, True),
    "iv a string": lambda d: d["frames"][0]["iv"][0].__setitem__(0, "0.2"),
    "iv zero": lambda d: d["frames"][0]["iv"][0].__setitem__(0, 0.0),
    "iv five": lambda d: d["frames"][0]["iv"][0].__setitem__(0, 5.0),
    "caption not a string": lambda d: d["frames"][0].update(caption=None),
    "caption too long": lambda d: d["frames"][0].update(caption="x" * 1000),
    "events not a list": lambda d: d["frames"][0].update(events={}),
    "event without label": lambda d: d["frames"][1]["events"][0].pop("label"),
    "event empty label": lambda d: d["frames"][1]["events"][0].update(label=""),
    "event opacity above 1": lambda d: d["frames"][1]["events"][0].update(opacity=1.5),
    "event opacity zero": lambda d: d["frames"][1]["events"][0].update(opacity=0),
}


@pytest.mark.parametrize("name", sorted(BAD_DOCS))
def test_validate_rejects(name):
    doc = make_doc()
    mutate = BAD_DOCS[name]
    result = mutate(doc)
    if name == "not an object":
        doc = result
    with pytest.raises(ValueError):
        rss.validate_frames_doc(doc)


def test_validate_names_the_path_of_the_problem():
    doc = make_doc()
    doc["frames"][2]["iv"][1][0] = -1.0
    with pytest.raises(ValueError, match=r"frames\[2\]\.iv\[1\]\[0\]"):
        rss.validate_frames_doc(doc)


def test_validate_does_not_mutate_its_input():
    doc = make_doc()
    before = copy.deepcopy(doc)
    rss.validate_frames_doc(doc)
    assert doc == before


# ---- frame_vertex_heights -------------------------------------------------------------------------


def test_heights_use_the_fixed_extent_and_vertex_order_i_dte_times_n_k_plus_j_k():
    doc = make_doc()
    # Frame 0: base 0.10, so iv row0 = [0.10, 0.15, 0.10], row1 = [0.12, 0.17, 0.12]; extent 0.10..0.50 (span 0.40).
    h = rss.frame_vertex_heights(doc, 0)
    assert len(h) == 6
    expected = [0.0, 0.05 / 0.40, 0.0, 0.02 / 0.40, 0.07 / 0.40, 0.02 / 0.40]
    assert h == pytest.approx(expected)


def test_the_same_iv_gives_the_same_height_in_two_frames():
    doc = make_doc()
    doc["frames"][3]["iv"] = copy.deepcopy(doc["frames"][0]["iv"])
    assert rss.frame_vertex_heights(doc, 3) == rss.frame_vertex_heights(doc, 0)


def test_a_higher_frame_is_taller_under_the_fixed_extent():
    doc = make_doc()
    assert sum(rss.frame_vertex_heights(doc, 2)) > sum(rss.frame_vertex_heights(doc, 0))


def test_heights_are_clamped_to_the_unit_box():
    doc = make_doc()
    doc["extent"] = [0.12, 0.16]  # frame 0 has values below 0.12 and above 0.16
    h = rss.frame_vertex_heights(doc, 0)
    assert min(h) == 0.0 and max(h) == 1.0


@pytest.mark.parametrize("n", [-1, 4, 99])
def test_heights_reject_a_frame_outside_the_document(n):
    with pytest.raises(IndexError):
        rss.frame_vertex_heights(make_doc(), n)


def test_positions_put_k_on_x_dte_on_y_and_height_on_z_in_the_display_box():
    doc = make_doc()
    pos = rss.frame_vertex_positions(doc, 0, (4.0, 4.0, 1.8))
    assert len(pos) == 6
    assert pos[0] == pytest.approx((0.0, 0.0, 0.0))
    assert pos[2] == pytest.approx((4.0, 0.0, 0.0))
    assert pos[4] == pytest.approx((2.0, 4.0, 1.8 * 0.07 / 0.40))


# ---- caption_keyframes ----------------------------------------------------------------------------


def test_event_captions_get_a_hide_render_key_at_each_edge_of_each_run():
    doc = make_doc(6)  # Spike is on frames 1 and 2 only
    keys = rss.caption_keyframes(doc)
    assert keys == [(0, "Spike", False), (1, "Spike", True), (3, "Spike", False)]


def test_a_caption_visible_from_frame_0_needs_no_initial_hidden_key_and_one_still_visible_at_the_end_needs_no_closing_key():
    doc = make_doc(3)
    doc["frames"][0]["events"] = [{"label": "Open", "opacity": 1.0}]
    doc["frames"][1]["events"] = [{"label": "Open", "opacity": 0.5}]
    doc["frames"][2]["events"] = [{"label": "Open", "opacity": 0.2}]
    assert rss.caption_keyframes(doc) == [(0, "Open", True)]


def test_a_label_that_comes_back_gets_two_runs():
    doc = make_doc(7)
    for n in (1, 4, 5):
        doc["frames"][n]["events"] = [{"label": "A", "opacity": 1.0}]
    doc["frames"][2]["events"] = []
    assert rss.caption_keyframes(doc) == [(0, "A", False), (1, "A", True), (2, "A", False), (4, "A", True), (6, "A", False)]


def test_two_labels_on_the_same_frame_are_independent_and_ordered_by_frame_then_label():
    doc = make_doc(3)
    doc["frames"][1]["events"] = [{"label": "B", "opacity": 1.0}, {"label": "A", "opacity": 1.0}]
    keys = rss.caption_keyframes(doc)
    assert [k for k in keys if k[1] == "A"] == [(0, "A", False), (1, "A", True), (2, "A", False)]
    assert [k for k in keys if k[1] == "B"] == [(0, "B", False), (1, "B", True), (2, "B", False)]
    assert keys == sorted(keys, key=lambda k: (k[0], k[1]))


def test_no_events_means_no_keyframes():
    doc = make_doc()
    for f in doc["frames"]:
        f["events"] = []
    assert rss.caption_keyframes(doc) == []


def test_date_captions_are_keyframed_the_same_way_one_text_per_distinct_caption():
    keys = rss.date_caption_keyframes(make_doc())
    interp = "2030-01-02 → 2030-02-20 (interpolated)"
    assert keys == [(0, "2030-01-02", True), (0, interp, False), (2, "2030-01-02", False), (2, interp, True)]


# ---- shape_key_schedule ---------------------------------------------------------------------------


def _value_at(keys, frame):
    """Blender's CONSTANT interpolation: hold the last key at or before `frame`; before the first key, the first key's value."""
    held = keys[0][1]
    for f, v in keys:
        if f <= frame:
            held = v
    return held


@pytest.mark.parametrize("n_frames", [1, 2, 3, 10])
def test_exactly_one_shape_key_is_on_at_every_frame(n_frames):
    schedule = rss.shape_key_schedule(n_frames)
    assert len(schedule) == n_frames
    for frame in range(n_frames):
        on = [k for k, keys in enumerate(schedule) if _value_at(keys, frame) == 1.0]
        assert on == [frame]


def test_key_k_is_1_at_frame_k_and_0_at_its_neighbours():
    schedule = rss.shape_key_schedule(5)
    assert schedule[2] == [(1, 0.0), (2, 1.0), (3, 0.0)]
    assert schedule[0] == [(0, 1.0), (1, 0.0)]
    assert schedule[4] == [(3, 0.0), (4, 1.0)]


def test_schedule_rejects_an_empty_sequence():
    with pytest.raises(ValueError):
        rss.shape_key_schedule(0)


# ---- frame budget ---------------------------------------------------------------------------------


def test_the_limit_is_2000_shape_keys():
    assert rss.MAX_SHAPE_KEYS == 2000


def test_plan_frames_keeps_every_frame_by_default():
    assert rss.plan_frames(5, 1) == [0, 1, 2, 3, 4]


def test_plan_frames_every_2_takes_every_other_frame_from_0():
    assert rss.plan_frames(5, 2) == [0, 2, 4]


def test_exactly_2000_frames_is_allowed():
    assert len(rss.plan_frames(2000, 1)) == 2000


def test_2001_frames_are_refused_and_every_2_is_suggested():
    with pytest.raises(ValueError, match=r"--every 2"):
        rss.plan_frames(2001, 1)


def test_the_suggestion_is_big_enough_to_fit():
    with pytest.raises(ValueError, match=r"--every 4"):
        rss.plan_frames(7001, 1)  # 7001/2 = 3501 still too many; /4 = 1751 fits


def test_every_2_makes_3000_frames_fit():
    assert len(rss.plan_frames(3000, 2)) == 1500


@pytest.mark.parametrize("every", [0, -1])
def test_every_must_be_positive(every):
    with pytest.raises(ValueError):
        rss.plan_frames(10, every)


# ---- colour ramp and mesh -------------------------------------------------------------------------


def test_viridis_stops_span_0_to_1_in_linear_light():
    stops = rss.viridis_stops(9)
    assert len(stops) == 9
    assert [s[0] for s in stops] == pytest.approx([i / 8 for i in range(9)])
    first = rss.viridis(0.0)
    assert stops[0][1][:3] == pytest.approx(tuple(rss.srgb_to_linear(c) for c in first))
    assert all(s[1][3] == 1.0 for s in stops)


def test_viridis_endpoints_match_the_matplotlib_samples():
    assert rss.viridis(0.0) == pytest.approx((0.2670, 0.0049, 0.3294))
    assert rss.viridis(1.0) == pytest.approx((0.9932, 0.9062, 0.1439))


def test_mesh_topology_is_one_quad_per_cell_wound_the_same_way():
    topo = rss.build_topology(3, 2)  # n_k = 3, n_dte = 2
    assert topo == [(0, 1, 4, 3), (1, 2, 5, 4)]


def test_sequence_mesh_reports_the_fixed_extent_for_the_axis_text():
    doc = make_doc()
    mesh = rss.build_sequence_mesh(doc, (4.0, 4.0, 1.8))
    assert mesh.iv_range == (0.10, 0.50)
    assert mesh.k_range == (-0.1, 0.1) and mesh.dte_range == (7.0, 30.0)
    assert len(mesh.vertices) == 6 and len(mesh.faces) == 2
    labels = [a.text for a in rss.axis_annotations(mesh)]
    assert "10.0%" in labels and "50.0%" in labels


# ---- camera maths (carried over from render_surface_hero.py) --------------------------------------


def test_camera_distance_is_finite_and_shrinks_for_a_wider_view_and_grows_with_the_margin():
    size = (4.0, 4.0, 1.8)
    target = tuple(s / 2 for s in size)
    direction = rss.direction_from_angles(rss.CAMERA_AZIMUTH_DEG, rss.CAMERA_ELEVATION_DEG)
    corners = rss.box_corners(size)
    narrow = rss.camera_fov(50.0, 36.0, 16 / 9)
    wide = rss.camera_fov(25.0, 36.0, 16 / 9)
    d_narrow = rss.fit_camera_distance(corners, target, direction, *narrow)
    d_wide = rss.fit_camera_distance(corners, target, direction, *wide)
    assert math.isfinite(d_narrow) and d_narrow > 0
    assert d_wide < d_narrow
    assert rss.fit_camera_distance(corners, target, direction, *narrow, margin=1.0) < d_narrow


def test_engine_candidates_try_cycles_first_then_eevee_newest_first():
    assert rss.engine_candidates(["BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"])[:3] == ["CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"]


# ---- command line ---------------------------------------------------------------------------------


def test_script_args_take_everything_after_the_first_double_dash():
    assert rss.script_args(["blender", "-b", "--python", "x.py", "--", "--data", "a.json"]) == ["--data", "a.json"]
    assert rss.script_args(["blender"]) == []


def test_parse_args_defaults(tmp_path):
    data = tmp_path / "frames.json"
    data.write_text("{}")
    args = rss.parse_args(["--data", str(data), "--out-dir", str(tmp_path / "out")])
    assert args.data == data and args.out_dir == tmp_path / "out"
    assert args.every == 1 and args.samples == rss.DEFAULT_SAMPLES and args.resolution is None


def test_parse_args_reads_every_samples_and_resolution(tmp_path):
    args = rss.parse_args(["--data", "a.json", "--out-dir", str(tmp_path), "--every", "3", "--samples", "8", "--resolution", "640x360"])
    assert (args.every, args.samples, args.resolution) == (3, 8, (640, 360))


@pytest.mark.parametrize(
    "argv",
    [
        [],  # --data and --out-dir are required
        ["--data", "a.json"],
        ["--data", "a.json", "--out-dir", "o", "--every", "0"],
        ["--data", "a.json", "--out-dir", "o", "--samples", "x"],
        ["--data", "a.json", "--out-dir", "o", "--resolution", "0x10"],
        ["--data", "a.json", "--out-dir", "o", "--resolution", "99999x10"],
        ["--data", "a.csv", "--out-dir", "o"],  # not a .json file
        ["--data", "a.json", "--out-dir", "o", "--bogus"],
    ],
)
def test_parse_args_rejects(argv):
    with pytest.raises(SystemExit):
        rss.parse_args(argv)


# ---- load_frames_doc ------------------------------------------------------------------------------


def test_load_reads_and_validates_a_file(tmp_path):
    import json

    p = tmp_path / "frames.json"
    p.write_text(json.dumps(make_doc()))
    assert rss.load_frames_doc(p)["id"] == "tiny"


def test_load_refuses_invalid_json_with_the_path_in_the_message(tmp_path):
    p = tmp_path / "frames.json"
    p.write_text("{not json")
    with pytest.raises(ValueError, match="frames.json"):
        rss.load_frames_doc(p)


def test_load_refuses_python_style_nan_tokens(tmp_path):
    import json

    doc = make_doc()
    text = json.dumps(doc).replace('"extent": [0.1,', '"extent": [NaN,', 1)  # json.loads accepts the bare NaN token; the validator must not
    assert "NaN" in text
    p = tmp_path / "frames.json"
    p.write_text(text)
    with pytest.raises(ValueError):
        rss.load_frames_doc(p)


def test_load_refuses_an_oversize_file(tmp_path, monkeypatch):
    p = tmp_path / "frames.json"
    p.write_text("{}")
    monkeypatch.setattr(rss, "MAX_DOC_BYTES", 1)
    with pytest.raises(ValueError, match="too large"):
        rss.load_frames_doc(p)


def test_load_refuses_a_missing_file(tmp_path):
    with pytest.raises(ValueError, match="does not exist"):
        rss.load_frames_doc(tmp_path / "nope.json")


# ---- subsample_doc --------------------------------------------------------------------------------


def test_subsample_keeps_the_chosen_frames_renumbered_and_leaves_the_original_alone():
    doc = make_doc(6)
    before = copy.deepcopy(doc)
    sub = rss.subsample_doc(doc, [0, 2, 4])
    assert [f["n"] for f in sub["frames"]] == [0, 1, 2]
    assert [f["iv"] for f in sub["frames"]] == [doc["frames"][i]["iv"] for i in (0, 2, 4)]
    assert sub["extent"] == doc["extent"] and sub["grid"] == doc["grid"]
    assert doc == before
    rss.validate_frames_doc(sub)


def test_captions_of_a_subsampled_doc_are_keyed_on_the_new_positions():
    doc = make_doc(6)  # Spike on frames 1 and 2
    sub = rss.subsample_doc(doc, [0, 2, 4])  # keeps only frame 2 of the Spike run, at position 1
    assert rss.caption_keyframes(sub) == [(0, "Spike", False), (1, "Spike", True), (2, "Spike", False)]


# ---- the TypeScript exporter and this script agree on the format ----------------------------------

REPO = SCRIPT.parents[2]


@pytest.mark.skipif(__import__("shutil").which("node") is None, reason="node is not installed; the exporter is TypeScript")
@pytest.mark.parametrize("dataset", ["synthetic-regime-story", "optionsdx-spy-4dates"])
def test_a_document_written_by_the_real_exporter_passes_validation(tmp_path, dataset):
    import subprocess

    out = tmp_path / "frames.json"
    # argv list, no shell. --fps 10 keeps the real frame count small.
    done = subprocess.run(
        ["node", "scripts/export.ts", "--format", "frames-json", "--dataset", dataset, "--fps", "10", "--out", str(out)],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert done.returncode == 0, done.stderr
    doc = rss.load_frames_doc(out)
    assert doc["id"] == dataset
    assert len(doc["frames"]) > 1
    sub = rss.subsample_doc(doc, rss.plan_frames(len(doc["frames"]), 2))
    assert len(rss.frame_vertex_heights(sub, 0)) == len(doc["grid"]["k"]) * len(doc["grid"]["dte"])
    assert rss.date_caption_keyframes(sub)  # every sequence has date captions
