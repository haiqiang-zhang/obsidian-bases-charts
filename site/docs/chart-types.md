---
title: Chart types
description: Choose between Line, Bar, Stacked Area, Pie, Radar, and Scatter views for your Bases data.
---

# Chart types

Choose the view that fits your question. All six Data Chart views read the Base's filtered note properties and support per-property aggregation.

| View | Good for | Typical setup |
| --- | --- | --- |
| Line | Change over time | Date → hours, completed items, or a measured value |
| Bar | Comparing categories | Project → total effort or number of notes |
| Stacked Area | Contributions to a changing total | Week → hours, grouped by activity |
| Pie | Composition of a total | Category → amount or count |
| Radar | Comparing profiles across categories | Dimension → planned and actual values |
| Scatter | Relationships and individual observations | Duration → score, grouped by subject |

## Line

Use a line chart for a date, numeric, or category axis. [Date grouping](./axes-and-dates#date-grouping) combines timestamps into calendar periods before aggregation.

In **Configure view**, **Gap handling** offers **Leave gap** and **Fill with 0**. Choose zero only when a missing value should mean no activity.

![Line chart showing a timeline with grouped series.](/gallery/01-line.png)

## Bar

Bars make differences between categories easy to compare. Native Bases groups become separate colored bars within each category.

**Show labels** displays values above the bars. **Show as percentages** formats the existing values with a percent sign; it does not calculate each bar's share of the total. Use percentage values or a suitable formula when enabling it.

![Bar chart comparing category values using native Bases groups.](/gallery/02-bar.png)

## Stacked Area

Each group contributes to a cumulative total across the X axis. Use this view when both the total and its composition matter.

Missing group values at an existing X position are filled with zero. Positive and negative values stack separately. Scale synchronization uses stacked totals.

![Stacked area chart showing contributions to a total over time.](/gallery/03-area.png)

## Pie

The Pie view uses a centered donut chart. Choose a **Category** and one or more **Values**. Each value property produces its own chart.

**Show labels**, **Show as percentages**, and **Ignore null** control the presentation. Percentage labels show each slice's share of the pie. When native grouping is enabled, slice labels include both the group and the category.

![Centered donut chart showing category shares.](/gallery/04-pie.png)

## Radar

Radar overlays selected value properties in a single chart. Categories form the spokes; each value property forms a profile. Native groups can add further profiles.

A radar needs at least **three categories with values**.

- **Shared across categories** uses a common scale, preserving differences in magnitude.
- **Per category** gives each category its own scale, useful for comparing profile shapes when category ranges differ.
- **Fill areas** toggles the translucent profile fills.

A missing value is drawn at zero and shown as missing in its tooltip. Click a profile to inspect its source files and categories.

![Radar chart comparing multiple value profiles across categories.](/gallery/05-radar.png)

## Scatter

Scatter preserves individual observations by default using **None** aggregation. You can instead aggregate points with the same X position and group using the Y menu.

When a column contains one selectable point, hover or click anywhere along that column. If several points share a column, select a specific point to inspect the correct files.

![Scatter chart showing individual observations and grouped series.](/gallery/06-scatter.png)

## More than one Y property

Line, Bar, Stacked Area, Pie, and Scatter render one chart per selected Y property. The layout adapts to the pane width and scrolls vertically when needed. Radar places selected properties together in one profile comparison.

For chart types outside these six built-in views, see [AI Chart](./ai-charts).
