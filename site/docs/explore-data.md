---
title: Explore the data
description: Move from a compact chart preview to a searchable table of source files.
---

# Explore the data

## Hover for a quick summary

Tooltips show the X property, the selected value, and group totals. They stay anchored to the chart data instead of following the cursor, keeping the plot readable.

The preview is intentionally compact. It does not contain a long file list or require moving the cursor into the tooltip.

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

![The chart data modal with a selected category, aggregate summary, search, and source-file rows.](/gallery/09-data-details.png)

## Read the table

The dialog shows the selected category, its condition, and the aggregate summary above a file table. File names include their folders so identically named notes remain distinguishable. Grouped results can include a group column.

The value in a row is that file's contribution, rather than a repeated copy of the aggregate. Radar's table identifies the categories behind the selected profile.

## Search and open

Search by file name or folder path. The search checks the entire result set, including files not yet displayed.

The table initially displays up to **100 files**. Use **Load more** for the next batch. Both scrolling directions stay inside the table when the dialog is small.

Click a file row to open its note. **Ctrl-click** or **Cmd-click** opens it in a new tab.
