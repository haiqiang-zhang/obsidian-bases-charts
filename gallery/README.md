# UI gallery files

15 screenshots of **Bases Chart Views** in Obsidian, using fictional English sample data.

The images are stored in `images/`. [index.html](index.html) displays the local gallery. `bases-chart-views-gallery.zip` contains the images, offline page, and sample data.

The gallery covers the **0.5.0** feature set. [capture-manifest.json](capture-manifest.json) records the plugin source commit, image dimensions, and SHA-256 hash for every capture.

## Files

| Image | What it shows |
| --- | --- |
| [overview.png](images/overview.png) | Eight weeks of stacked workstream data with an anchored weekly summary |
| [01-line.png](images/01-line.png) | A grouped timeline with compact date labels and native Bases controls |
| [02-bar.png](images/02-bar.png) | Six projects compared using grouped bars and value labels |
| [03-area.png](images/03-area.png) | Four workstreams contributing to the weekly total |
| [04-pie.png](images/04-pie.png) | A centered donut with percentage shares |
| [05-radar.png](images/05-radar.png) | Current and target profiles across six capabilities |
| [06-scatter.png](images/06-scatter.png) | Effort and impact across 32 individual initiatives |
| [07-color-palettes.png](images/07-color-palettes.png) | The per-view palette picker with color swatches |
| [08-date-grouping.png](images/08-date-grouping.png) | The original datetime property grouped into calendar weeks |
| [09-data-details.png](images/09-data-details.png) | The data dialog displayed over the complete Bases chart |
| [10-ai-chart.png](images/10-ai-chart.png) | A custom reference-library timeline with an ECharts zoom slider |
| [11-dark.png](images/11-dark.png) | Chart colors and native controls in dark mode |
| [12-multiple-measures.png](images/12-multiple-measures.png) | Hours and deliverables in one view, with separate aggregations |
| [13-formula-editor.png](images/13-formula-editor.png) | The native Bases formula editor opened from the X-axis picker |
| [14-column-hover.png](images/14-column-hover.png) | A dashed guide and anchored summary for a single-point column |

## Sample data

[demo-vault/Chart Gallery](demo-vault/Chart%20Gallery) contains the portable notes and `.base` files used for capture:

- **96 work sessions** across twelve weeks in Q3 2026; timeline views focus on **64 sessions across the last eight weeks**.
- **Four workstreams:** Design, Engineering, Research, and Writing.
- **Six projects:** Atlas, Beacon, Canvas, Field Notes, Launchpad, and Signal.
- **Six capability records** with current and target values for Radar.
- **32 initiative records** with effort and impact values for Scatter.
- A saved **Reference library** ECharts option with **619 fictional papers** across six research collections from 2014 to 2026.

Copy the whole **Chart Gallery** folder into a separate test vault and keep its folder name, since the Bases filters refer to that path. Open `Welcome.md` for the view descriptions. Use version 0.5.0 or later to reproduce the feature set.

The AI Chart example renders a saved configuration with fictional data. It does not query source notes live. Creating or updating configurations through Claudian requires its setup.

## Reproduce the gallery

Regenerate the deterministic sample data from the repository root:

```sh
python3 scripts/gallery/generate-fixtures.py
```

Copy the sample folder into **Obsidian Sandbox** and enable the development plugin. Run `python3 scripts/gallery/capture-showcase.py` to capture all 15 images in a dedicated popout, leaving the personal vault untouched. It opens the real settings, formula editor, hover state, data dialog, saved AI example, and dark-theme view, then closes its window.

Most captures use an **860 × 520** window at **100% zoom**. Radar uses a taller **860 × 660** window; the two-measure view uses **1040 × 520**. The capture includes the native Bases toolbar and crops away the window frame. The data dialog is shown over the chart in its full window. No screenshot pixels are retouched.

After replacing the screenshots, rebuild the offline gallery, manifest, and archive. Pass the commit containing the plugin code that was actually running during capture:

```sh
python3 scripts/gallery/package-gallery.py --source-commit <capture-source-commit>
```

The packager records PNG dimensions and hashes, verifies the archive, and stores the supplied source commit in the capture manifest.
