#!/usr/bin/env python3
"""Build the offline English gallery and its reproducible download archive.

Reads the original PNG files without modifying them. Uses only Python's standard
library. Run after capturing or replacing screenshots to refresh dimensions,
SHA-256 hashes, the offline index, and the ZIP.
"""
from __future__ import annotations

import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import struct
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

REPO = Path(__file__).resolve().parents[2]
GALLERY = REPO / "gallery"
CATALOG = [
    ("overview.png", "Your notes, in perspective", "Eight weeks of studio work, four workstreams, and a compact summary anchored to the selected week.", "03 Capacity.base", "A season of progress"),
    ("12-multiple-measures.png", "Two measures, one view", "Compare hours and deliverables in separate charts, with an independent aggregation for each measure.", "01 Trend.base", "Hours & deliverables"),
    ("08-date-grouping.png", "Choose the right time scale", "Group the original datetime property into calendar weeks without rewriting the notes.", "01 Trend.base", "Calendar weeks"),
    ("13-formula-editor.png", "Use the native formula editor", "Give weekly dates a short label with a Bases formula, edited directly from the X-axis picker.", "01 Trend.base", "Weekly momentum"),
    ("14-column-hover.png", "Make the whole column useful", "A dashed guide and an anchored summary make a single-point column easy to inspect and click.", "01 Trend.base", "Hours & deliverables"),
    ("09-data-details.png", "Go from a value to its files", "Open the source-file table, search its contents, and return to the underlying notes.", "03 Capacity.base", "A season of progress"),
    ("07-color-palettes.png", "Give each view its own palette", "Preview color collections directly in the view's palette picker.", "03 Capacity.base", "A season of progress"),
    ("01-line.png", "Follow the momentum", "Eight weeks of studio work, with short date labels and a distinct color for each workstream.", "01 Trend.base", "Weekly momentum"),
    ("02-bar.png", "Compare projects", "Grouped bars make the contributions of four workstreams easy to compare.", "02 Workstreams.base", "Projects by workstream"),
    ("03-area.png", "See the bigger picture", "Stacked areas show the total workload and how its composition changes over eight weeks.", "03 Capacity.base", "A season of progress"),
    ("04-pie.png", "Understand the mix", "A centered donut gives each workstream its share of the total.", "04 Focus mix.base", "Where the time goes"),
    ("05-radar.png", "Compare complete profiles", "Current and target values share six capability axes in one radar view.", "05 Skills.base", "A balanced practice"),
    ("06-scatter.png", "Explore the trade-offs", "Individual initiatives reveal the relationship between effort and impact.", "06 Effort and impact.base", "Effort & impact"),
    ("10-ai-chart.png", "Build a custom view", "A saved ECharts timeline compares six research collections, with smooth curves and an overview zoom slider.", "10 AI insights.base", "Reference library"),
    ("11-dark.png", "At home after dark", "Chart colors and interface details adapt to Obsidian's dark theme.", "03 Capacity.base", "A season of progress"),
]


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("Expected an original PNG with an IHDR header")
    return struct.unpack(">II", data[16:24])


def make_index(captures, source_commit):
    hero = captures[0]
    cards = []
    for number, shot in enumerate(captures[1:], 1):
        path = "images/" + shot["file"]
        width, height = shot["size"]["width"], shot["size"]["height"]
        cards.append(f'''<article class="card">
<a class="image-link" href="{escape(path)}" aria-label="Open full-resolution image: {escape(shot['title'])}"><img src="{escape(path)}" width="{width}" height="{height}" loading="lazy" alt="{escape(shot['description'])}"></a>
<div class="card-body"><p class="eyebrow">{number:02d} / {escape(shot['file'].split('-', 1)[1].removesuffix('.png').replace('-', ' '))}</p><h2>{escape(shot['title'])}</h2><p>{escape(shot['description'])}</p><a class="download" href="{escape(path)}" download>Original PNG <span aria-hidden="true">&#8599;</span><small>{width:,} &times; {height:,}</small></a></div>
</article>''')
    return '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bases Chart Views - English UI Gallery</title>
<meta name="description" content="Real Obsidian screenshots of Bases Chart Views, using rich English-only sample data. Full-resolution images for documentation and community posts.">
<style>
:root{color-scheme:light;--paper:#f7f7f3;--ink:#283330;--muted:#69726d;--line:#dedfd8;--accent:#376e62}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:4px}a:hover{color:#1b493e}a:focus-visible{outline:3px solid var(--accent);outline-offset:5px}header,main,footer{max-width:1240px;margin:auto;padding-inline:32px}.top{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-block:25px;border-bottom:1px solid var(--line)}.brand{font-weight:650;letter-spacing:-.02em;color:var(--ink);text-decoration:none}.top nav{display:flex;flex-wrap:wrap;gap:22px;font-size:14px}.top nav a{text-decoration:none}.intro{max-width:780px;padding:68px 0 36px}.eyebrow{text-transform:uppercase;font-size:11px;letter-spacing:.14em;color:var(--muted);font-weight:600;margin:0 0 10px}h1{font-size:clamp(36px,5vw,58px);line-height:1.08;letter-spacing:-.045em;font-weight:650;margin:0 0 22px}.lead{font-size:19px;color:var(--muted);line-height:1.6;margin:0;max-width:690px}.hero{margin:0 0 60px}.hero a{display:block}.hero img,.card img{display:block;width:100%;height:auto;background:white}.hero img{border:1px solid var(--line);border-radius:12px}.hero figcaption{display:flex;justify-content:space-between;gap:20px;margin-top:14px;font-size:13px;color:var(--muted)}.section-head{display:flex;justify-content:space-between;align-items:baseline;gap:24px;margin:0 0 22px}.section-head h2{font-size:24px;letter-spacing:-.025em;margin:0}.section-head p{font-size:14px;color:var(--muted);margin:0}.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:36px;max-width:1000px;margin-inline:auto}.card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}.image-link{display:block;overflow:hidden;border-bottom:1px solid var(--line)}.image-link:hover img{opacity:.94}.card-body{padding:24px 25px}.card h2{font-size:21px;line-height:1.3;letter-spacing:-.025em;margin:0 0 9px;font-weight:620}.card-body>p:not(.eyebrow){font-size:14px;line-height:1.6;color:var(--muted);min-height:45px;margin:0 0 18px}.download{display:flex;align-items:center;gap:6px;font-size:13px;text-decoration:none;font-weight:600}.download small{margin-left:auto;color:var(--muted);font-size:11px;font-weight:400}.note{margin:48px 0 64px;padding:26px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:40px}.note h2{font-size:16px;margin:0 0 8px}.note p{font-size:14px;color:var(--muted);margin:0}footer{padding-bottom:32px;display:flex;justify-content:space-between;gap:20px;font-size:12px;color:var(--muted)}footer a{color:inherit}@media(max-width:700px){header,main,footer{padding-inline:20px}.top{align-items:flex-start;flex-direction:column;gap:12px}.top nav{gap:16px}.intro{padding-top:42px}.lead{font-size:17px}.grid{grid-template-columns:1fr;gap:22px}.section-head{display:block}.section-head p{margin-top:7px}.hero{margin-bottom:38px}.hero figcaption{display:block}.hero figcaption a{margin-top:7px}.note{grid-template-columns:1fr;gap:24px;margin-bottom:36px}.card-body{padding:22px}.card-body>p:not(.eyebrow){min-height:0}footer{flex-direction:column}}
</style>
</head>
<body>
<header><div class="top"><a class="brand" href="index.html">Bases Chart Views</a><nav aria-label="Gallery navigation"><a href="https://haiqiang-zhang.github.io/obsidian-bases-charts/">Website</a><a href="README.md">Usage notes</a><a href="capture-manifest.json">Capture manifest</a></nav></div></header>
<main>
<div class="intro"><p class="eyebrow">English UI Gallery</p><h1>Your notes.<br>A clearer view.</h1><p class="lead">Real charts, native controls, and the notes behind every value. Explore a fictional studio's work through Bases Chart Views in Obsidian.</p></div>
<figure class="hero"><a href="images/overview.png" aria-label="Open the full-resolution chart overview"><img src="images/overview.png" width="''' + str(hero["size"]["width"]) + '''" height="''' + str(hero["size"]["height"]) + '''" alt="''' + escape(hero["description"]) + '''"></a><figcaption><span>Four workstreams. Eight weeks. One clear view.</span><a href="images/overview.png" download>Download the original overview PNG</a></figcaption></figure>
<div class="section-head"><h2>Explore the details</h2><p>Click any image to view it at full resolution.</p></div>
<section class="grid" aria-label="Chart and control screenshots">
''' + "\n".join(cards) + '''
</section>
<section class="note" aria-label="About these screenshots"><div><h2>Ready for community posts</h2><p>Use the original PNGs when uploading to the Obsidian community. All text and sample data are in English. The gallery contains fictional data, with no private notes or account details.</p></div><div><h2>Captured in Obsidian</h2><p>Plugin source: <a href="https://github.com/haiqiang-zhang/obsidian-bases-charts/commit/''' + source_commit + '''">''' + source_commit[:7] + '''</a>. The AI Chart example renders a saved ECharts timeline. It does not show a Claudian generation session or a live query of sample notes.</p></div></section>
</main>
<footer><span>Bases Chart Views &middot; English UI Gallery</span><a href="https://github.com/haiqiang-zhang/obsidian-bases-charts">Source and documentation</a></footer>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True,
                        help='Git commit containing the plugin code used for these captures')
    args = parser.parse_args()
    source_commit = subprocess.run(
        ['git', 'rev-parse', '--verify', args.source_commit + '^{commit}'],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout.strip()
    old_path = GALLERY / "capture-manifest.json"
    old = json.loads(old_path.read_text()) if old_path.exists() else {}
    prior = {item["file"]: item for item in old.get("captures", [])}
    captures = []
    for filename, title, description, base, view in CATALOG:
        data = (GALLERY / "images" / filename).read_bytes()
        width, height = png_size(data)
        item = {"file": filename, "path": "images/" + filename, "title": title, "description": description,
                "size": {"width": width, "height": height}, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        if base and view:
            item["view"] = {"file": "Chart Gallery/" + base, "viewName": view}
        recorded = prior.get(filename, {})
        for key in ("viewport", "zoom", "view"):
            if key not in recorded:
                raise ValueError(f"Missing capture {key} for {filename}; recapture it before packaging")
            item[key] = recorded[key]
        captures.append(item)
    manifest = {"schema_version": 1, "source": "Real Obsidian Sandbox UI with synthetic English-only data",
                "plugin_commit": source_commit, "language": "en", "image_format": "PNG", "capture_count": len(captures),
                "capture_note": "Original UI captures from a dedicated Obsidian Sandbox popout. Viewport, zoom, view state, PNG dimensions, and hashes are recorded for each image.",
                "overview_note": "A single stacked-area view with a compact summary anchored to a selected week.",
                "ai_chart_note": "The AI Chart image renders a saved Apache ECharts timeline option with fictional reference-library data. It does not show a Claudian generation session or a live query of sample notes.",
                "captures": captures}
    old_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (GALLERY / "index.html").write_text(make_index(captures, source_commit), encoding="utf-8")
    members = [GALLERY / "README.md", GALLERY / "index.html", old_path]
    members.extend(GALLERY / "images" / item["file"] for item in captures)
    # Include portable samples so the README's sample-data links also work offline.
    members.extend(path for path in sorted((GALLERY / "demo-vault").rglob("*")) if path.is_file())
    archive = GALLERY / "bases-chart-views-gallery.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in members:
            entry = ZipInfo(path.relative_to(GALLERY).as_posix(), date_time=(2026, 10, 26, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        for item in captures:
            assert hashlib.sha256(bundle.read(item["path"])).hexdigest() == item["sha256"]
    print(json.dumps({"index": str(GALLERY / "index.html"), "manifest": str(old_path), "archive": str(archive), "screenshots": len(captures), "archive_entries": len(members), "archive_bytes": archive.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
