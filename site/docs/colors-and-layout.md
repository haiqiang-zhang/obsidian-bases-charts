---
title: Colors and layout
description: Per-view color palettes, theme variants, and chart layout.
---

# Colors and layout

## Color palette

Open the view selector on the left of the toolbar, choose **Configure view**, then open **Color palette**.

The picker shows color swatches, supports search, and places the current selection first with a checkmark. Each view stores its own palette in the `.base` file.

![Color palette picker with swatch previews and a selected palette.](/gallery/07-color-palettes.png)

| Palette family | Choices |
| --- | --- |
| Mixed colors | Auto, Colorful, Earth, Coastal |
| Single-color shades | Colorless, Blue, Green, Yellow, Purple, Teal, Orange, Pink, Red |

**Auto** uses the default palette. Mixed palettes assign different hues to groups; single-color palettes use shades of one hue.

## Light and dark themes

Every palette includes light and dark variants. Series keep their hue order when the theme changes. Interface text follows Obsidian's font and theme styling.

![Charts using a palette adapted to Obsidian's dark theme.](/gallery/11-dark.png)

## Layout by chart type

Line, Bar, Stacked Area, and Scatter use narrow chart margins below the native Bases toolbar. Pie and Radar are centered in their chart area. Legends sit below the charts.

Selecting several Y properties creates multiple charts in responsive columns. Smaller panes scroll when more vertical space is needed. Radar keeps the selected measures in one chart.

## Filters and menus

Native Bases filters limit the records shown in a chart without changing the notes.

The chart controls sit within the Bases toolbar. Standard menus follow Obsidian's **Native menus** preference.
