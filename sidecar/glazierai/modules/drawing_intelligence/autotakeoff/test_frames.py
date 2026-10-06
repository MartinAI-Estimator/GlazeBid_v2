"""
test_frames.py — elevation grid reader + frame payloads on drawn test frames.

    python -m pytest sidecar/glazierai/modules/drawing_intelligence/autotakeoff/test_frames.py
    (or run directly: python test_frames.py)

Each test draws a frame elevation the way CAD exports do (every member as two
thin face lines), then checks what read_grid / frame_payloads make of it.
"""
from __future__ import annotations

import os
import sys
import tempfile

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

if __package__ in (None, ""):
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")))
    from glazierai.modules.drawing_intelligence.autotakeoff.elevation_grid import read_grid
    from glazierai.modules.drawing_intelligence.autotakeoff.frames import frame_payloads, cells_of, _members_clean
    from glazierai.modules.drawing_intelligence.autotakeoff.pdfgeom import clear_cache
else:
    from .elevation_grid import read_grid
    from .frames import frame_payloads, cells_of, _members_clean
    from .pdfgeom import clear_cache

PPI = 1.5            # page points per inch (1/8" = 1'-0" is 1.5 pt/in)
SL = 2.0             # sightline


def _frame(pg, x0, y0, W, H, cols, door_cols=(), horiz=None, ink=(0, 0, 0)):
    """Draw a storefront: cols = CL widths; door_cols get no sill; horiz = {col: [CL heights]}."""
    sh = pg.new_shape()
    X = lambda v: x0 + v * PPI
    Y = lambda v: y0 + (H - v) * PPI           # v measured from the bottom
    sh.draw_rect(fitz.Rect(X(0), Y(H), X(W), Y(0)))
    sh.draw_rect(fitz.Rect(X(SL), Y(H - SL), X(W - SL), Y(SL) if not door_cols else Y(0)))
    edges = [0.0]
    for w in cols:
        edges.append(edges[-1] + w)
    for e in edges[1:-1]:                     # mullions: two faces
        sh.draw_line(fitz.Point(X(e - SL / 2), Y(H - SL)), fitz.Point(X(e - SL / 2), Y(0)))
        sh.draw_line(fitz.Point(X(e + SL / 2), Y(H - SL)), fitz.Point(X(e + SL / 2), Y(0)))
    for c in range(len(cols)):
        a, b = X(edges[c] + (SL if c == 0 else SL / 2)), X(edges[c + 1] - (SL if c == len(cols) - 1 else SL / 2))
        if c not in door_cols:                # sill inner face
            sh.draw_line(fitz.Point(a, Y(SL)), fitz.Point(b, Y(SL)))
        for h in (horiz or {}).get(c, []):    # horizontal: two faces
            sh.draw_line(fitz.Point(a, Y(h - SL / 2)), fitz.Point(b, Y(h - SL / 2)))
            sh.draw_line(fitz.Point(a, Y(h + SL / 2)), fitz.Point(b, Y(h + SL / 2)))
    sh.finish(color=ink, width=0.36)
    sh.commit()
    return [X(0), Y(H), X(W), Y(0)]


def _page():
    clear_cache()
    doc = fitz.open()
    return doc, doc.new_page(width=1224, height=792)


def test_three_bays_door_in_the_middle_with_transom():
    doc, pg = _page()
    rect = _frame(pg, 100, 100, 100, 108, [31, 38, 31], door_cols={1}, horiz={0: [86], 1: [86], 2: [86]})
    g = read_grid(pg, rect, 100, 108)
    kinds = [c["kind"] for c in g["columns"]]
    assert kinds == ["glass", "door", "glass"], g
    assert [round(c["width"]) for c in g["columns"]] == [31, 38, 31]
    door = g["columns"][1]
    assert abs(door["doorHeight"] - 86) < 1.0
    assert all(len(c["rows"]) == 2 for c in g["columns"])


def test_glass_only_frame_with_shared_rows():
    doc, pg = _page()
    rect = _frame(pg, 100, 100, 180, 120, [60, 60, 60], horiz={0: [24], 1: [24], 2: [24]})
    g = read_grid(pg, rect, 180, 120)
    assert [c["kind"] for c in g["columns"]] == ["glass"] * 3
    assert g["rowsShared"] and abs(g["rowsShared"][0] - 24) < 1.0
    assert [round(v) for v in g["mullionsX"]] == [60, 120]


def test_tag_boxes_in_another_colour_are_not_members():
    doc, pg = _page()
    rect = _frame(pg, 100, 100, 72, 108, [36, 36], horiz={0: [86], 1: [86]})
    sh = pg.new_shape()                       # blue glass tags across the lites
    for x in (110, 170):
        sh.draw_rect(fitz.Rect(x, 150, x + 30, 160))
    sh.finish(color=(0, 0, 1), width=0.36)
    sh.commit()
    g = read_grid(pg, rect, 72, 108)
    assert all(len(c["rows"]) == 2 for c in g["columns"]), g


def test_member_faces_merge_and_slivers_drop():
    assert _members_clean([40.0, 42.0, 80.0, 82.0], 120) == [41.0, 81.0]
    assert _members_clean([2.0, 60.0, 117.5], 120) == [60.0]          # jamb / head inner faces


def test_schedule_cells():
    c = cells_of("DOOR: B100 | DOOR OPENING WIDTH: 6'-0\" | FRAME TYPE: -- || PANEL MATERIAL 8: Wide Stile")
    assert c["DOOR OPENING WIDTH"] == "6'-0\"" and c["FRAME TYPE"] == "--"


def test_payload_links_door_to_frame_type_and_reads_bays():
    doc, pg = _page()
    rect = _frame(pg, 100, 100, 100, 108, [31, 38, 31], door_cols={1}, horiz={0: [86], 1: [86], 2: [86]})
    path = os.path.join(tempfile.mkdtemp(), "t.pdf")
    doc.save(path)
    result = {
        "project": "t", "sheets": [{"page": 0, "sheet": "A8.1"}],
        "schedule_entries": [{"mark": "SF1", "page": 0, "sheet": "A8.1"}],
        "elevation_snaps": [],
        "items": [
            {"id": "SF1", "cls": "ext_sf", "kind": "scope", "w_in": 100, "h_in": 108, "qty": 3, "qty_source": "plan tags",
             "frames": [{"rect": rect, "w_in": 100, "h_in": 108, "mullions_x": [], "mullions_y": []}],
             "desc": "MARK: SF1 | FRAME TYPE: F1 | GLAZING: 1\" INSULATED", "series": [], "notes": [], "citations": ["A8.1 schedule type SF1"], "flags": []},
            {"id": "D1", "cls": "ext_sf_door", "kind": "scope", "is_door": True, "qty": 1,
             "desc": "DOOR NO.: D1 | WIDTH: 3'-0\" | HEIGHT: 7'-2\" | FRAME TYPE: F1 | HARDWARE: 2", "series": [], "notes": [], "citations": [], "flags": []},
            {"id": "BREAK METAL", "cls": "break_metal", "kind": "scope", "qty": 120.0, "qty_source": "LF on elevations"},
        ],
    }
    out = frame_payloads(result, None, path)
    f = out["frames"][0]
    assert f["mark"] == "SF1" and f["quantity"] == 3 and f["sizeMode"] == "frame"
    assert [c["kind"] for c in f["columns"]] == ["glass", "door", "glass"]
    assert f["columns"][1].get("door") == "D1" and f["doors"][0]["width"] == 36 and f["doors"][0]["hardware"] == "2"
    assert f["frameSeries"] and f["provenance"]["system"]["source"] == "assumed"
    assert any(n["kind"] == "brake_metal" and n["unit"] == "LF" for n in out["nonFrames"])
    assert out["summary"]["doorsInFrames"] == 1 and out["summary"]["standaloneDoors"] == 0


if __name__ == "__main__":
    import inspect
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and inspect.isfunction(fn):
            fn(); n += 1; print("ok", name)
    print(n, "passed")
