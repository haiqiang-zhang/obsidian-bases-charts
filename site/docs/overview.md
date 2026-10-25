---
title: Overview
description: Chart types, configuration controls, and source-file inspection in Obsidian Bases.
---

# Overview

Bases Chart Views adds six Data Chart types and an AI Chart view to [Obsidian Bases](https://help.obsidian.md/bases). Charts use [Apache ECharts](https://echarts.apache.org/).

![Eight weeks of studio work in a stacked area chart, with native Bases controls and an anchored weekly summary.](/gallery/overview.png)

## Data Charts and AI Chart

| | Data Charts | AI Chart |
| --- | --- | --- |
| Source | Properties in a Base | A saved ECharts configuration |
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

## Controls

| Control | Purpose |
| --- | --- |
| View selector → Configure view | Chart appearance, color palette, and applicable scale settings |
| X axis | Category, number, date, file property, or formula |
| Y axes | Measures, their order, and per-property aggregation |
| Group | Native Bases groups, shown as chart series |
| Filter | Choose which notes enter the Base's result set |
| Sort | Control category order; date buckets form a chronological timeline |

Pie and Radar label their controls **Category** and **Values**. The AI Chart toolbar only shows its view selector because the saved ECharts option defines its data and appearance.

## View configuration

Add several views to one Base: a line for change over time, bars for category comparisons, and a donut for composition. Axis selection, date grouping, aggregation, and palette are saved with each view in the `.base` file.

[Chart types](./chart-types) · [Axes and dates](./axes-and-dates) · [Groups and aggregation](./groups-and-aggregation)

:::info Documentation version
These docs cover the **0.5.0** feature set. See [release notes](https://github.com/haiqiang-zhang/obsidian-bases-charts/releases) for subsequent changes.
:::
