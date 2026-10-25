# Bases Chart Views

Interactive charts for [Obsidian Bases](https://help.obsidian.md/bases), powered by [Apache ECharts](https://echarts.apache.org/).

Compare categories, follow a timeline, and open the notes behind every number. Choose from six Data Chart views, or use Claudian to create a custom ECharts visualization.

[**Get the plugin**](https://community.obsidian.md/plugins/bases-chart-views) · [Documentation](https://haiqiang-zhang.github.io/obsidian-bases-charts/overview) · [UI Gallery](https://haiqiang-zhang.github.io/obsidian-bases-charts/screenshots)

![Four chart views displayed together in native Obsidian split panes, with English sample data.](gallery/images/overview.png)

## Charts for your notes

| View | Use it to… |
| --- | --- |
| **Line** | Follow change over time |
| **Bar** | Compare categories and groups |
| **Stacked Area** | See how groups contribute to a changing total |
| **Pie** | Show the composition of a total in a centered donut |
| **Radar** | Compare profiles across several dimensions |
| **Scatter** | Explore relationships and individual observations |

Each Data Chart uses the Base's current results. Select note, file, or formula properties from the toolbar, then choose an aggregation for each measure.

- **Native Bases controls.** Filter, sort, and group your notes. Use file folders, note properties, or formulas as X values.
- **Calendar grouping.** Combine timestamps by day, week, month, or year without changing the source property.
- **Independent measures.** Add and reorder Y properties, each with its own Sum, Average, Count, Min, or Max aggregation. Scatter also supports None.
- **A palette for every view.** Preview Auto, Colorful, Earth, Coastal, and single-color palettes. Each has light and dark variants.
- **Source-file inspection.** Hover for a compact, anchored summary. Click a chart mark or supported column to open a searchable table of its source files.
- **Responsive layout.** Cartesian charts use the available width; Pie and Radar sit at the center. Multiple measures form separate charts, while Radar overlays them.

![Line chart showing a rich timeline of grouped sample data in the native Bases interface.](gallery/images/01-line.png)

## From a chart to its source

The data dialog shows the selected category, aggregate summary, and individual file values. Search by file name or folder, load more results, and open a source note directly from its row.

![The chart data dialog with a category condition, search, and source-file table.](gallery/images/09-data-details.png)

[Explore the data →](https://haiqiang-zhang.github.io/obsidian-bases-charts/explore-data)

## AI Chart

Use [Claudian](https://github.com/YishenTu/claudian) to create and refine a custom visualization: a heatmap, Sankey diagram, treemap, graph, gauge, or another Apache ECharts chart.

Add an **AI Chart** view, choose **Set up AI Chart**, and describe the visualization to Claudian. It writes the ECharts option into the `.base` file. This view renders its saved configuration independently of the live Bases query.

![The included saved ECharts heatmap rendered in the AI Chart view.](gallery/images/10-ai-chart.png)

[AI Chart setup and behavior →](https://haiqiang-zhang.github.io/obsidian-bases-charts/ai-charts)

## Get started

1. Install and enable Bases Chart Views.
2. Create or open a Base and add a chart view.
3. Choose **X axis** and **Y axes** in the toolbar. Pie and Radar use **Category** and **Values**.
4. Select a measure and its aggregation. To count notes, use **file name → Count**.
5. Open **Configure view → Color palette** to choose this view's colors.

[First chart guide](https://haiqiang-zhang.github.io/obsidian-bases-charts/overview#your-first-chart) · [Axes and dates](https://haiqiang-zhang.github.io/obsidian-bases-charts/axes-and-dates) · [Groups and aggregation](https://haiqiang-zhang.github.io/obsidian-bases-charts/groups-and-aggregation)

## Installation

### Community plugins (recommended)

Install [Bases Chart Views](https://community.obsidian.md/plugins/bases-chart-views) from the Obsidian community plugin directory, then enable it. Requires **Obsidian 1.12.0 or later** and the Bases core plugin.

### BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. In BRAT settings, choose **Add Beta Plugin**.
3. Enter `https://github.com/haiqiang-zhang/obsidian-bases-charts` and choose **Add Plugin**.
4. Enable **Bases Chart Views** in **Settings → Community plugins**.

The documentation and gallery follow the current development build. Some features shown were added after **0.4.1**. Check the [release notes](https://github.com/haiqiang-zhang/obsidian-bases-charts/releases) for availability in your installed version; BRAT installs published releases, not unpublished commits.

## English UI gallery

The screenshots use a fictional studio workspace with English properties and sample records. The overview shows four chart views in native Obsidian split panes. The AI example renders the included saved heatmap configuration. No personal vault content is included.

[Browse the gallery](https://haiqiang-zhang.github.io/obsidian-bases-charts/screenshots) · [Download the PNG set](https://haiqiang-zhang.github.io/obsidian-bases-charts/gallery/bases-chart-views-gallery.zip) · [Local gallery and sample data](gallery/README.md)

## Contributing

Ideas, bug reports, and pull requests are welcome. Open an [issue](https://github.com/haiqiang-zhang/obsidian-bases-charts/issues) with your Obsidian version, plugin version, and steps to reproduce the behavior.

## License

[GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Acknowledgements

This plugin started as a fork of [obsidian-bases-charts-plugin](https://github.com/mProjectsCode/obsidian-bases-charts-plugin) by [mProjectsCode](https://github.com/mProjectsCode), and has since been fully rewritten from scratch using native TypeScript and [Apache ECharts](https://echarts.apache.org/). AI Chart is powered by [Claudian](https://github.com/YishenTu/claudian).
