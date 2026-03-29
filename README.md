# Bases Charts

![Banner](images/banner.png)

This plugin for Obsidian adds interactive chart views to Bases, powered by [Apache ECharts](https://echarts.apache.org/).

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin), with active development, bug fixes, and new features.

## Usage

1. Create a [Base](https://help.obsidian.md/bases) in your vault.
2. With the plugin installed and enabled, create a new Bases view and select a chart type.
3. Configure the **X axis** property and **Y axis** properties in the view settings.

### Chart Types

- **Scatter** — individual data points, optional labels, click to open source file
- **Line** — connected data points, configurable gap handling (`Leave gap` or `Fill with 0`)
- **Bar** — grouped bars with optional data labels and percentage display
- **Pie** — donut chart with optional labels, percentages, and null filtering

### Features

- Aggregation modes: Sum, Average, Count, Min, Max (and None for Scatter)
- Multi chart mode: separate by Y axis or by group
- Sync Y axes across multiple charts
- Y axis min/max override
- Interactive tooltips with clickable file links
- X axis sorting via Bases Sort configuration
- Auto-resize, light/dark theme support
- Mobile-optimized layout

## Installation

### BRAT (recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. In BRAT settings, click **Add Beta Plugin**.
3. Enter `https://github.com/haiqiang-zhang/obsidian-bases-charts` and click **Add Plugin**.
4. Enable **Bases Charts** in Settings > Community plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/haiqiang-zhang/obsidian-bases-charts/releases/latest).
2. Create a folder `bases-charts` in your vault's `.obsidian/plugins/` directory.
3. Copy the downloaded files into that folder.
4. Enable **Bases Charts** in Settings > Community plugins.

## License

[GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Acknowledgements

Based on [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin) by [mProjectsCode](https://github.com/mProjectsCode). Rewritten with [Apache ECharts](https://echarts.apache.org/) for improved rendering and features.

## Contributions

Contributions are always welcome. If you have an idea, feel free to open a feature request under the issue tab or create a pull request.
