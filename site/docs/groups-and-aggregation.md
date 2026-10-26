---
title: Groups and aggregation
description: Compare native Bases groups and summarize each value property independently.
---

# Groups and aggregation

**X** determines the positions or categories. **Y** determines the measures. **Group** splits those measures into separate series.

For example, with X set to `Week`, Y set to `Hours`, and Group set to `Activity`, each week contains a separate series for each activity.

## Native Bases groups

Use the **Group** menu in the toolbar. The charts use the groups selected by Bases and preserve their manual order. Filtering groups changes the data shown in the chart.

- Line and Scatter use one color per group.
- Bar places group bars next to each other within a category.
- Stacked Area stacks group contributions.
- Pie includes group and category in slice labels.
- Radar creates a profile for each selected measure and group.

![A bar chart comparing several groups across categories.](/gallery/02-bar.png)

## Choose an aggregation for each measure

Open **Y axes** (or **Values**) and use the aggregation control beside each selected property.

| Aggregation | Meaning | Example |
| --- | --- | --- |
| Sum | Add numeric values | Total hours by project |
| Average | Mean of numeric values | Average rating by subject |
| Count | Count records with a value | Number of files by folder |
| Min | Smallest numeric value | Shortest session by activity |
| Max | Largest numeric value | Highest score by subject |
| None | Keep observations separate; Scatter only | Each session as a point |

Aggregation happens within each **X value, Y property, and group**. With calendar grouping, timestamps first become day, week, month, or year buckets.

## Count notes or count a property

To count the notes in each category, use **file name → Count**. Every note has a file name.

To count how many records have a particular property value, select that property and use **Count**. Missing values are excluded. A numeric zero is a value and is counted.

## Multiple measures

A view can show `Hours → Sum` and `Rating → Average` together, with a separate chart for each measure. Their aggregations are independent. Radar compares the selected measures in a single chart instead.

The example below sums hours and deliverables by week and workstream. Both charts use the same group colors, with a separate scale for each measure.

![Weekly hours and deliverables, each comparing four workstreams in a separate chart with a shared color legend.](/gallery/12-multiple-measures.png)

Use [Y scale controls](./axes-and-dates#y-scale) when several charts should share the same scale.

## Inspect an aggregate

Click a bar, point, area column, pie slice, or radar profile to see its source files and their individual values.

[Data inspection](./explore-data)
