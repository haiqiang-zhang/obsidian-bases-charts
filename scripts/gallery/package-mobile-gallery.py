#!/usr/bin/env python3
"""Package original Obsidian mobile-emulation captures without retouching pixels.

Capture metadata must describe the actual viewport, device scale, view and theme.
Optional capture-time crop bounds describe excluded emulator status space.
The source commit identifies the plugin build used by the complete capture set.
"""
from __future__ import annotations

import argparse
import hashlib
from html import escape
import json
import math
from pathlib import Path
import struct
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

REPO = Path(__file__).resolve().parents[2]
GALLERY = REPO / 'gallery' / 'mobile'
CATALOG = [
    ('01-line.png', 'Line', 'Weekly hours across four workstreams.'),
    ('02-bar.png', 'Bar', 'Hours by project and workstream.'),
    ('03-area.png', 'Stacked Area', 'Workstream contributions to weekly hours.'),
    ('04-pie.png', 'Pie', 'Each workstream’s share of the total hours.'),
    ('05-radar.png', 'Radar', 'Current and target values across six capabilities.'),
    ('06-scatter.png', 'Scatter', 'Effort and impact across individual initiatives.'),
    ('07-date-grouping.png', 'Date grouping', 'The X-axis sheet with calendar-week grouping selected.'),
    ('08-y-properties.png', 'Y properties', 'Selected measures and their independent aggregations.'),
    ('09-color-palettes.png', 'Color palettes', 'The view’s palette picker with color previews.'),
    ('10-data-drawer.png', 'Source files', 'View data opens the source-file drawer above the selected chart.'),
    ('11-multiple-measures.png', 'Multiple measures', 'Scroll through vertically stacked measures while the selected values stay below the charts.'),
    ('12-dark.png', 'Dark theme', 'Chart colors and native controls in Obsidian’s dark theme.'),
    ('13-touch-preview.png', 'Touch preview', 'Before a selection, the fixed preview shows a touch instruction. Tap or slide across the chart to inspect values.'),
    ('14-landscape.png', 'Large landscape viewport', 'At 1024 × 768, the chart uses the available height without a bottom preview panel.'),
]


def png_size(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('Expected an original PNG with an IHDR header')
    return struct.unpack('>II', data[16:24])


def expected_png_size(entry):
    """Validate capture geometry without changing the original viewport record."""
    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    viewport = entry['viewport']
    scale = entry['device_scale_factor']
    if not isinstance(viewport, list) or len(viewport) != 2 or not all(number(v) and v > 0 for v in viewport):
        raise ValueError('Viewport must contain two positive finite dimensions')
    if not number(scale) or scale <= 0:
        raise ValueError('Device scale factor must be positive and finite')
    crop = entry.get('crop')
    if crop is None:
        dimensions = viewport
    else:
        if not isinstance(crop, dict) or not all(key in crop and number(crop[key]) for key in ('x', 'y', 'width', 'height')):
            raise ValueError('Crop must contain finite x, y, width and height values')
        x, y, width, height = (crop[key] for key in ('x', 'y', 'width', 'height'))
        if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > viewport[0] or y + height > viewport[1]:
            raise ValueError('Crop must be a nonempty rectangle inside the original viewport')
        dimensions = [width, height]
    pixels = [round(value * scale) for value in dimensions]
    if min(pixels) < 1:
        raise ValueError('Capture must contain at least one pixel in each dimension')
    return pixels


def make_index(captures):
    cards = []
    for shot in captures:
        src = 'images/' + shot['file']
        orientation = ' is-landscape' if shot['viewport'][0] > shot['viewport'][1] else ''
        cards.append(f'''<figure class="card{orientation}">
<a href="{escape(src)}" aria-label="Enlarge: {escape(shot['description'])}"><img src="{escape(src)}" width="{shot['size']['width']}" height="{shot['size']['height']}" loading="lazy" alt="{escape(shot['description'])}"></a>
<figcaption><strong>{escape(shot['title'])}</strong><span>{escape(shot['description'])}</span></figcaption>
</figure>''')
    return '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bases Chart Views · Mobile UI gallery</title>
<style>
:root{color-scheme:light;--paper:#f8f8f5;--ink:#283330;--muted:#66716c;--line:#dedfd8;--accent:#376e62}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:4px}a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}header,main,footer{max-width:1080px;margin:auto;padding-inline:24px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:24px;border-bottom:1px solid var(--line)}header>a{font-weight:650;text-decoration:none;color:var(--ink)}nav{display:flex;gap:20px;font-size:14px}nav a{text-decoration:none}.intro{max-width:740px;margin:48px 0 32px}h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-.025em;margin:0 0 16px;font-weight:600}.intro p{color:var(--muted);margin:8px 0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:24px}.card{margin:0;min-width:0;background:white;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgb(28 44 34 / 4%)}.card.is-landscape{grid-column:1/-1}.card>a{display:block;cursor:zoom-in}.card img{display:block;width:100%;height:auto}.card figcaption{padding:16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:5px}.card strong{font-weight:600;font-size:15px}.card span{font-size:13px;color:var(--muted)}footer{padding-block:36px;font-size:13px;color:var(--muted)}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){header{align-items:flex-start;flex-direction:column;gap:12px}.intro{margin-top:32px}.grid{grid-template-columns:minmax(0,1fr);max-width:390px;margin-inline:auto}}
</style></head><body>
<header><a href="index.html">Bases Chart Views</a><nav aria-label="Gallery navigation"><a href="../index.html">Desktop gallery</a><a href="https://haiqiang-zhang.github.io/obsidian-bases-charts/mobile-gallery">Documentation</a></nav></header>
<main><div class="intro"><h1>Mobile UI gallery</h1><p>Chart views, touch inspection, axis settings, palettes, and source-file details.</p><p>In portrait, tap or slide across the chart to update the fixed preview. The selection stays after you lift your finger. View data opens its source files. Landscape and tablet layouts use the full chart area without this panel.</p><p>Captured in Obsidian’s official mobile emulation at a 390 × 844 portrait phone viewport and a 1024 × 768 large landscape viewport, with 2× pixel density. Unused status-bar space is excluded. These are desktop emulator captures, not physical-device screenshots. Sample data is fictional and in English.</p></div>
<section class="grid" aria-label="Mobile screenshots">
''' + '\n'.join(cards) + '''
</section></main><footer>Obsidian mobile emulation · English sample data · Select an image to view it at full resolution.</footer>
</body></html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True, help='Commit containing the plugin build used for all mobile captures')
    parser.add_argument('--metadata', type=Path, default=GALLERY / 'capture-metadata.json')
    args = parser.parse_args()
    commit = subprocess.run(['git', 'rev-parse', '--verify', args.source_commit + '^{commit}'], cwd=REPO,
                            capture_output=True, text=True, check=True).stdout.strip()
    recorded = json.loads(args.metadata.read_text(encoding='utf-8'))
    metadata = {item['file']: item for item in recorded['captures']}
    captures = []
    for filename, title, description in CATALOG:
        entry = metadata[filename]
        for key in ('viewport', 'device_scale_factor', 'zoom', 'view', 'theme'):
            if key not in entry:
                raise ValueError(f'Missing {key} metadata for {filename}')
        data = (GALLERY / 'images' / filename).read_bytes()
        width, height = png_size(data)
        expected = expected_png_size(entry)
        if [width, height] != expected:
            raise ValueError(f'{filename}: PNG {width}×{height} differs from capture bounds and scale {expected}')
        captures.append({
            **entry, 'file': filename, 'path': 'images/' + filename, 'title': title,
            'description': description, 'plugin_commit': commit,
            'size': {'width': width, 'height': height}, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
        })
    manifest = {
        'schema_version': 1,
        'source': 'Real Obsidian UI in official desktop mobile emulation, with synthetic English-only data',
        'device_validation': 'Desktop mobile emulation; not a physical iOS or Android device test',
        'plugin_commit': commit, 'language': 'en', 'image_format': 'PNG',
        'capture_count': len(captures),
        'capture_note': 'Native UI captures may exclude unused emulator status space at capture time. No screenshot pixels are retouched.',
        'captures': captures,
    }
    manifest_path = GALLERY / 'capture-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (GALLERY / 'index.html').write_text(make_index(captures), encoding='utf-8')
    members = [GALLERY / 'README.md', GALLERY / 'index.html', manifest_path]
    members.extend(GALLERY / item['path'] for item in captures)
    archive = GALLERY / 'bases-chart-views-mobile-gallery.zip'
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in members:
            entry = ZipInfo(path.relative_to(GALLERY).as_posix(), date_time=(2026, 10, 26, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        for item in captures:
            assert hashlib.sha256(bundle.read(item['path'])).hexdigest() == item['sha256']
    print(json.dumps({'captures': len(captures), 'index': str(GALLERY / 'index.html'),
                      'manifest': str(manifest_path), 'archive': str(archive)}, indent=2))


if __name__ == '__main__':
    main()
