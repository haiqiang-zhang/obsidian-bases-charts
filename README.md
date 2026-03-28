# Bases Charts

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin), with active development, bug fixes, and new features.

This plugin for Obsidian adds three new Bases views: **Scatter Charts**, **Line Charts**, and **Bar Charts**, powered by [Apache ECharts](https://echarts.apache.org/).

## Usage

1. Create a [Base](https://help.obsidian.md/bases) in your vault.
2. With the plugin installed and enabled, create a new Bases view: Scatter, Line, or Bar chart.
3. Select the property or formula for the **X axis** in the view settings.
4. Select which properties to display on the **Y axis** using the Base's `Properties` menu (top right).

**Supported types:**
- X axis: `Number`, `Date`, and `String`
- Y axis: `Number` only

It is recommended to disable the default file name property.

### Aggregation

When multiple data points share the same X value, the plugin automatically aggregates them. Available aggregation modes:

- **Sum** (default) — total of all values
- **Average** — mean of all values
- **Count** — number of data points
- **Min / Max** — minimum or maximum value

Click on an aggregated data point to see all contributing files and their individual values.

### Grouping and Multiple Charts

The view settings include a `Multi chart mode` dropdown:

- **Separate by property** — one chart per Y axis property. Data points are colored by group.
- **Separate by group** — one chart per group (using Base's `Sort > Group by`). Data points are colored by Y axis property.

### Bar Charts

- Grouped bars displayed side by side per category
- Optional data labels (toggle in view settings)
- Optional percentage display
- Y axis min/max override supported

### Line Charts

- Automatic sorting of X axis values
- Hover crosshair with value display

### Scatter Charts

- Optional label property shown on hover
- Click to open the source file

## Installation

Currently only via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## License

[GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Acknowledgements

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin) by [mProjectsCode](https://github.com/mProjectsCode). Rewritten with [Apache ECharts](https://echarts.apache.org/) for improved rendering and features.

## Contributions

Contributions are always welcome. If you have an idea, feel free to open a feature request under the issue tab or create a pull request.
