---
title: Explore the data
description: Chart tooltips, click targets, and the source-file table.
---

# Explore the data

## Tooltips

Tooltips show the X property, selected value, and group totals. Their position is anchored to chart data.

Click the chart to view the source files.

![A single-point chart column with a dashed vertical guide and a compact summary anchored to its data.](/gallery/14-column-hover.png)

## Click to view files

Click the chart itself to open its data table:

| Chart | Where to click |
| --- | --- |
| Bar | A bar or its category column |
| Line and Scatter | A point, or anywhere in a column containing a single selectable point |
| Stacked Area | A column in the plot |
| Pie | A slice |
| Radar | A profile |

When several Line or Scatter points share one column, select the individual point. Single-point columns show a dashed vertical guide and support clicking across the plot height.

![A Bases chart with its data dialog open, showing the selected category, aggregate summary, search field, and source-file table.](/gallery/09-data-details.png)

## Read the table

The dialog shows the selected category, its condition, and the aggregate summary above a file table. File names include their folders so identically named notes remain distinguishable. Grouped results can include a group column.

The value in a row is that file's contribution, rather than a repeated copy of the aggregate. Radar's table identifies the categories behind the selected profile.

## Search and open

Search by file name or folder path. The search checks the entire result set, including files not yet displayed.

The table initially displays up to **100 files**. Use **Load more** for the next batch. Both scrolling directions stay inside the table when the dialog is small.

Click a file row to open its note. **Ctrl-click** or **Cmd-click** opens it in a new tab.
