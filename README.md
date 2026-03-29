# Bases Charts

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin), with active development, bug fixes, and new features.

This plugin for Obsidian adds three new Bases views: **Scatter Charts**, **Line Charts**, and **Bar Charts**, powered by [Apache ECharts](https://echarts.apache.org/).

## Usage

1. Create a [Base](https://help.obsidian.md/bases) in your vault.
2. With the plugin installed and enabled, create a new Bases view: Scatter, Line, or Bar chart.
3. Select the property or formula for the **X axis** in the view settings.
4. Select which properties to display on the **Y axis** (labeled "Y Axis" in the toolbar).

### Supported Types

- **X axis**: `Number`, `Date`, `String`, `List` (each list element becomes a separate category)
- **Y axis**: `Number` for all aggregation modes, any type for `Count` aggregation

### Aggregation

Available aggregation modes:

- **Sum** (default for Line/Bar) — total of all values
- **Average** — mean of all values
- **Count** — number of data points (works with any Y axis type)
- **Min / Max** — minimum or maximum value
- **None** (Scatter only) — no aggregation, each data point shown individually

When Y axis is a non-numeric property and aggregate is not Count, a message with a "Use Count" button is displayed.

### Sorting

X axis categories are sorted using the Bases Sort configuration. The sort order is independent of Group By — it reads from the ungrouped, pre-sorted data provided by Bases.

### Grouping and Multiple Charts

The view settings include a `Multi chart mode` dropdown:

- **Separate by property** — one chart per Y axis property. Data points are colored by group.
- **Separate by group** — one chart per group (using Base's `Sort > Group by`). Data points are colored by Y axis property.

### Interactive Tooltips

- **Single series**: hover to see aggregated value and contributing files. Tooltip is clickable — click a file name to open it. Click on the chart to pin/unpin the tooltip.
- **Multiple series (grouped)**: hover shows each group's value with color markers (default ECharts behavior).
- **Scatter (None aggregate)**: hover shows file name and value with crosshair. Click a point to open the file directly.

### Scatter Charts

- Supports `None` aggregate for individual data points
- Optional label property shown on hover
- Click to open the source file
- Crosshair axis pointer for precise value reading

### Line Charts

- X axis sorted by Bases Sort settings
- Missing values handling: `Skip` (connect across gaps) or `Treat as 0` (dip to zero)
- Hover crosshair with value display

### Bar Charts

- Grouped bars displayed side by side per category
- Maximum bar width for consistent appearance
- Optional data labels (toggle in view settings)
- Optional percentage display
- Y axis min/max override supported
- Hover shadow highlight on categories

### Other Features

- Y axis min/max override for all chart types
- Sync Y axes across multiple charts
- Auto-resize with window
- Obsidian theme support (light/dark)
- Legend displayed when group by is active

## Installation

Currently only via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## License

[GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Acknowledgements

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin) by [mProjectsCode](https://github.com/mProjectsCode). Rewritten with [Apache ECharts](https://echarts.apache.org/) for improved rendering and features.

## Contributions

Contributions are always welcome. If you have an idea, feel free to open a feature request under the issue tab or create a pull request.
