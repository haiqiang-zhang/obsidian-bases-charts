# Mobile UI gallery

14 English screenshots of Bases Chart Views, using fictional sample data in **Obsidian’s official mobile emulation**. These are desktop emulator captures, not screenshots from a physical iOS or Android device.

Portrait phone captures use **390 × 844 CSS pixels**; the large landscape capture uses **1024 × 768**. Both use **2× pixel density** and **100% zoom**. Captures exclude the emulator’s unused status-bar space while retaining the native navigation, controls, and drawers. No screenshot pixels are retouched.

On portrait phones, tapping or sliding across the chart updates a fixed preview below it. The selection remains after release. **View data** opens the native source-file drawer. Landscape and tablet layouts use the full chart area without the bottom preview.

- `images/` contains the original PNG files.
- [index.html](index.html) displays the local gallery.
- `bases-chart-views-mobile-gallery.zip` contains the images, offline gallery, and manifest.
- [capture-manifest.json](capture-manifest.json) records the source commit, view state, dimensions, and SHA-256 hash for every image.

## Screenshots

| Image | Contents |
| --- | --- |
| [01-line.png](images/01-line.png) | Weekly hours across four workstreams |
| [02-bar.png](images/02-bar.png) | Project and workstream comparisons |
| [03-area.png](images/03-area.png) | Stacked weekly hours |
| [04-pie.png](images/04-pie.png) | Workstream proportions |
| [05-radar.png](images/05-radar.png) | Current and target capability profiles |
| [06-scatter.png](images/06-scatter.png) | Effort and impact observations |
| [07-date-grouping.png](images/07-date-grouping.png) | X-axis settings with calendar-week grouping |
| [08-y-properties.png](images/08-y-properties.png) | Multiple measures and aggregation settings |
| [09-color-palettes.png](images/09-color-palettes.png) | Palette selection with color previews |
| [10-data-drawer.png](images/10-data-drawer.png) | View data opens the source-file drawer over the chart |
| [11-multiple-measures.png](images/11-multiple-measures.png) | Scrollable stacked charts with a fixed selection preview |
| [12-dark.png](images/12-dark.png) | Chart and controls in dark mode |
| [13-touch-preview.png](images/13-touch-preview.png) | Initial preview before selecting chart data |
| [14-landscape.png](images/14-landscape.png) | Large 1024 × 768 landscape viewport without a bottom preview |

## Rebuild the package

Capture the plugin in a separate test vault using Obsidian’s `dev:mobile on` mode, and restore desktop mode after testing. The shared fixtures are in [../demo-vault/Chart Gallery](../demo-vault/Chart%20Gallery). Install the current plugin build in Obsidian Sandbox, then run:

```sh
python3 scripts/gallery/capture-mobile.py
```

The script captures all 14 images through actual touch input and restores the saved Sandbox workspace. For a manual large landscape capture, use `--view '03 Capacity.base' 'A season of progress' --viewport 1024 768`, then `--current 14-landscape`. Finish manual sessions with `--close`.

Store the capture metadata in `capture-metadata.json`. Every capture must record its filename, viewport, capture bounds, device scale factor, zoom, view state, and theme. Run from the repository root after all images are present:

```sh
python3 scripts/gallery/package-mobile-gallery.py --source-commit <capture-source-commit>
```

The packager checks the PNG dimensions against the recorded capture bounds and scale, calculates hashes, and verifies the local ZIP. Pass the commit containing the exact plugin build used for capture.
