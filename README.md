# Bases Charts

This plugin for Obsidian adds various chart views to Bases, powered by [Apache ECharts](https://echarts.apache.org/).

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin), with active development, bug fixes, and new features.

## Usage

1. Create a [Base](https://help.obsidian.md/bases) in your vault.
2. With the plugin installed and enabled, create a new Bases view and select a chart type.
3. Configure the **X axis** property and **Y axis** properties in the view settings.

### Chart Types

- **Scatter** — individual data points, optional labels, click to open source file
- **Line** — connected data points, configurable missing value handling (`Skip` or `Treat as 0`)
- **Bar** — grouped bars with optional data labels and percentage display
- **Pie** — donut chart with optional labels, percentages, and null filtering

### Common Features

- Aggregation modes: Sum, Average, Count, Min, Max (and None for Scatter)
- Multi chart mode: separate by property or by group
- Sync Y axes across multiple charts
- Y axis min/max override
- Interactive tooltips with clickable file links
- X axis sorting via Bases Sort configuration
- Auto-resize, light/dark theme support

## Installation

Currently only via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## License

[GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Acknowledgements

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin) by [mProjectsCode](https://github.com/mProjectsCode). Rewritten with [Apache ECharts](https://echarts.apache.org/) for improved rendering and features.

## Contributions

Contributions are always welcome. If you have an idea, feel free to open a feature request under the issue tab or create a pull request.
