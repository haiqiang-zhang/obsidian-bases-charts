---
title: AI Chart
description: Claudian setup and saved ECharts configuration for AI Chart views.
---

# AI Chart

AI Chart renders a saved [Apache ECharts](https://echarts.apache.org/) configuration. Use it for visualizations beyond the built-in Data Charts, such as a heatmap, Sankey diagram, treemap, graph, or gauge.

[Claudian](https://github.com/YishenTu/claudian) can read your data and write the configuration into the selected view in your `.base` file.

![A saved ECharts timeline comparing six research collections, with smooth curves and an overview zoom slider.](/gallery/10-ai-chart.png)

The **Reference library** example uses a saved option containing 619 fictional papers across six collections from 2014 to 2026. The option includes smooth lines, area fills, and a zoom slider.

## Set up

1. Install [Claudian](https://github.com/YishenTu/claudian) and complete its setup.
2. Add an **AI Chart** view to your Base.
3. Choose **Set up AI Chart**.
4. Ask Claudian to create the visualization for that Base and view.

Setup installs the plugin's `bases-charts-ai` skill and configures the associated Claudian system prompt. The skill describes the saved ECharts option format and how to find the active AI Chart view.

## Example prompt

Specify the source data, chart type, and labels:

> In this Base, create a heatmap of focus hours by weekday and time block. Use the session notes as the source, label the axes in English, and include a color scale.

Ask Claudian to update the option when you change the date range, labels, palette, or chart type.

## How it differs from Data Charts

An AI Chart displays the data stored in its **`echarts-option`** configuration. It does not automatically convert the live Base result set into chart series.

When source notes change, ask Claudian to update the saved option if the visualization needs new data. The generated option defines labels, colors, tooltips, and layout. Built-in X/Y/Group controls and the source-file dialog belong to Data Charts, so they are not shown for AI Chart.

## Configuration format

A minimal saved option looks like this:

```yaml
views:
  - type: chart-ai
    name: Weekly hours
    echarts-option:
      xAxis:
        type: category
        data: [Mon, Tue, Wed, Thu, Fri]
      yAxis:
        type: value
        name: Hours
      series:
        - type: bar
          data: [3, 4, 2, 5, 3]
```

ECharts options are stored as YAML data. JavaScript functions, such as function-valued formatters, cannot be represented in this saved format.

## ECharts version

Version **0.5.0** uses **ECharts 6.1**. When adapting older options, use `axis.min` to set an explicit axis minimum. In ECharts 6.1, `axis.startValue` does not implicitly set that minimum.

For a chart that updates directly with Bases properties and includes source-file inspection, choose a [Data Chart](./chart-types).
