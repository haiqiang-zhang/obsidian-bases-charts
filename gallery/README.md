# English UI Gallery

Full-resolution screenshots of **Bases Chart Views** in Obsidian, with an English-only fictional studio workspace. Use the PNG files for Obsidian community posts, documentation, and plugin presentations.

Open [index.html](index.html) for an offline gallery, or use the files in [images](images) directly. The ZIP also contains this offline page and the sample data.

The gallery is captured from the current development build. Some features shown are newer than release 0.4.1.

## Files

| Image | What it shows |
| --- | --- |
| [overview.png](images/overview.png) | Four chart views in native Obsidian split panes |
| [01-line.png](images/01-line.png) | A grouped timeline with native Bases controls |
| [02-bar.png](images/02-bar.png) | Category comparisons with grouped bars |
| [03-area.png](images/03-area.png) | Group contributions over time |
| [04-pie.png](images/04-pie.png) | A centered donut with category shares |
| [05-radar.png](images/05-radar.png) | Current and target profiles across capabilities |
| [06-scatter.png](images/06-scatter.png) | Effort and impact across individual initiatives |
| [07-color-palettes.png](images/07-color-palettes.png) | The per-view palette picker with color swatches |
| [08-date-grouping.png](images/08-date-grouping.png) | Date-property selection and calendar grouping |
| [09-data-details.png](images/09-data-details.png) | Searchable source files behind a chart value |
| [10-ai-chart.png](images/10-ai-chart.png) | A custom ECharts heatmap in AI Chart |
| [11-dark.png](images/11-dark.png) | The chart interface and palette in dark mode |

[Download all gallery PNGs](bases-chart-views-gallery.zip) · [View the website gallery](https://haiqiang-zhang.github.io/obsidian-bases-charts/screenshots)

## Suggested community post selection

Use **overview.png** as the main image, then **01-line.png**, **07-color-palettes.png**, and **09-data-details.png** to explain the timeline, appearance controls, and source-file workflow. Add another chart image when discussing that specific chart type.

Upload the original PNGs instead of taking screenshots of the website. Their full resolution keeps labels readable. The images contain synthetic data and no personal notes, account details, or private workspace content.

## Sample data

[demo-vault/Chart Gallery](demo-vault/Chart%20Gallery) contains the portable example notes and `.base` files used for capture:

- **96 work sessions** across twelve weeks in Q3 2026.
- **Four workstreams:** Design, Engineering, Research, and Writing.
- **Six projects:** Atlas, Beacon, Canvas, Field Notes, Launchpad, and Signal.
- **Six capability records** with current and target values for Radar.
- **32 initiative records** with effort and impact values for Scatter.

Copy the whole **Chart Gallery** folder into a separate test vault and keep its folder name, since the Bases filters refer to that path. Open `Welcome.md` for the view descriptions. Use the current development build to reproduce every view shown in this gallery.

The AI Chart example renders the included saved ECharts heatmap option. It does not query its source notes live. The capture demonstrates saved-option rendering; it does not show a Claudian generation session. Reproducing the normal AI Chart workflow requires its Claudian setup.

To regenerate the deterministic sample data from the repository root:

```sh
python3 scripts/gallery/generate-fixtures.py
```

`scripts/gallery/capture.py` captures the six built-in chart views in a dedicated **Obsidian Sandbox** popout. Copy the sample folder into that test vault first and enable the development plugin. Supplemental images capture the real open settings, data dialog, saved AI example, and dark-theme view. The overview is one native four-pane window captured at 75% zoom. No screenshot pixels are retouched.

After updating screenshots, rebuild the offline gallery, image manifest, and download package:

```sh
python3 scripts/gallery/package-gallery.py
```

The UI screenshots come from the plugin running in Obsidian. The overview is one capture of four live chart views arranged with native Obsidian splits in a separate window.
