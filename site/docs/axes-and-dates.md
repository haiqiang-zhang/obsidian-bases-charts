---
title: Axes and dates
description: Choose note, file, and formula properties, then group timestamps into useful calendar periods.
---

# Axes and dates

## Choose an X property

Open **X axis** in the Bases toolbar. The selected property appears at the top; search the remaining properties below it.

X supports:

- Note properties, such as `Project`, `Hours`, or `Completed at`.
- File properties, including name, folder, creation time, and modification time.
- Formulas defined in the Base.

The vault's root folder appears as `/`. Pie and Radar call this control **Category**.

## Choose Y properties

Open **Y axes** to add measures. Each selected property has its own aggregation control. Reorder or remove properties from the selected list.

Use numeric properties with **Sum**, **Average**, **Min**, or **Max**. Use **Count** for the number of records with a value, including text properties. Scatter also supports **None** to preserve separate observations.

Pie and Radar call this control **Values**. See [Groups and aggregation](./groups-and-aggregation) for examples.

## Date grouping

A datetime property can contain many timestamps on the same day. Group it before aggregation to produce a useful timeline.

1. Select the date or datetime property in **X axis**.
2. Open **Date grouping** for the selected property.
3. Choose **Day**, **Week**, **Month**, or **Year**.
4. Set the desired Y aggregation, such as **Count** or **Sum**.

![X-axis controls with a selected date property and calendar grouping.](/gallery/08-date-grouping.png)

| Option | Result |
| --- | --- |
| Exact time | Retains individual timestamps |
| Day | Combines records from the same calendar day |
| Week | Combines records into weeks beginning on Monday |
| Month | Combines records into calendar months |
| Year | Combines records into calendar years |

Calendar grouping follows local dates. Timestamps with time zones are interpreted in the local time zone. Only periods containing records are shown; the chart does not create an empty period for every missing day or week.

The grouping choice belongs to the selected X property in that view. Changing to another X property does not apply the previous property's calendar grouping to it.

## Formulas and property editing

Click a property's name to select it. Use the arrow at the right of its row to open Obsidian's native property editor.

**Add formula** opens the native formula editor with completion and validation, when that editor is available in your Obsidian version. After a valid new formula is saved and you leave the editor, the chart selects it. **Back** returns to the axis picker you came from.

For ordinary daily, weekly, monthly, or yearly grouping, use **Date grouping** directly. A formula is useful when you want a different calculation or label, such as an amount converted to another unit.

![Obsidian's native formula editor displaying the Week label formula from the chart's X-axis picker.](/gallery/13-formula-editor.png)

The gallery uses `date(note.WeekStart).format("MMM D")` to give an existing week-start property a compact label. A formatted label is text: keep the Base sorted by `WeekStart` to preserve chronological order. Use native date grouping when the original timestamps need to be combined into periods.

## Sorting

Use the native **Sort** menu to arrange category values through the Base's result order. Calendar buckets are sorted chronologically. A descending sort on the selected date property reverses that timeline.

## Y scale

For Line, Bar, Stacked Area, and Scatter, open **Configure view → Y scale**:

- **Sync across charts** shares bounds across the selected Y-property charts.
- **Min Y override** fixes the lower bound.
- **Max Y override** fixes the upper bound.

Leave an override empty to let the chart determine it. Compare like units when synchronizing scales. Pie has no Cartesian Y scale; Radar has its own scale setting.
