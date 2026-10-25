---
title: Overview
description: Turn Obsidian Bases properties into interactive charts, with native controls and access to source notes.
---

# Overview

Bases Chart Views adds interactive chart views to [Obsidian Bases](https://help.obsidian.md/bases), powered by [Apache ECharts](https://echarts.apache.org/). Your notes remain the source data. A Base chooses the files; each chart view chooses how to present them.

![Four chart views in native Obsidian split panes using English demonstration data.](/gallery/overview.png)

## Two ways to make a chart

| | Data Charts | AI Chart |
| --- | --- | --- |
| Start with | Properties in a Base | A description of the visualization you want |
| Configure with | X, Y, Group, and view settings | [Claudian](https://github.com/YishenTu/claudian) and a saved ECharts option |
| Available views | Line, Bar, Stacked Area, Pie, Radar, Scatter | The ECharts chart types supported by the generated option |
| Data behavior | Uses the Base's current filtered results | Renders data saved in its ECharts option |
| Inspect source notes | Built-in chart-to-file table | Depends on the custom option; no built-in file drill-down |

## Your first chart

1. [Install and enable the plugin](./installation).
2. Create or open a Base containing the notes you want to chart.
3. Add a view and choose **Bar Chart**.
4. Open **X axis** and choose a category property, such as `Project`.
5. Open **Y axes**, add a numeric property such as `Hours`, and choose **Sum**.
6. Click a bar to inspect the files contributing to its value.

To count notes instead, add **file name** as the Y property and select **Count**. Text properties need **Count** to produce a numeric result.

## Where the controls live

| Control | Purpose |
| --- | --- |
| View selector → Configure view | Chart appearance, color palette, and applicable scale settings |
| X axis | Category, number, date, file property, or formula |
| Y axes | Measures, their order, and per-property aggregation |
| Group | Native Bases groups, shown as chart series |
| Filter | Choose which notes enter the Base's result set |
| Sort | Control category order; date buckets form a chronological timeline |

Pie and Radar label their controls **Category** and **Values**. The AI Chart toolbar only shows its view selector because the saved ECharts option defines its data and appearance.

## Keep the same data, ask another question

Add several views to one Base: a line for change over time, bars for category comparisons, and a donut for composition. Axis selection, date grouping, aggregation, and palette are saved with each view in the `.base` file.

Start with [Chart types](./chart-types), then explore [Axes and dates](./axes-and-dates) and [Groups and aggregation](./groups-and-aggregation).

:::info Documentation version
These docs and gallery describe the current development branch. The latest published release may not include every feature shown here. Check the [release notes](https://github.com/haiqiang-zhang/obsidian-bases-charts/releases) when comparing your installed version.
:::
