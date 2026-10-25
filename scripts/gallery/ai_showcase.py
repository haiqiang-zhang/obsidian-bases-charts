#!/usr/bin/env python3
"""A deterministic, English-only ECharts example for the AI Chart gallery.

The data is fictional. This is a saved chart configuration, not a recording of
an AI conversation or a live query of the demonstration vault.

Import ``build_reference_library_option`` from the fixture generator. A caller
may pass Obsidian's resolved interface font via ``font_family``; otherwise the
option leaves the font family to ECharts. No callbacks or executable JavaScript
are needed, so the returned dictionary can be saved directly in a .base file.
"""
from __future__ import annotations

import argparse
import json


YEARS = tuple(str(year) for year in range(2014, 2027))
COLLECTIONS = (
    ("Vector search", "#4876bd", "#80a5dc", (1, 2, 2, 3, 4, 5, 8, 10, 13, 18, 24, 29, 27)),
    ("Language models", "#8a73b8", "#b19bd8", (0, 0, 1, 1, 2, 2, 4, 5, 8, 17, 29, 38, 34)),
    ("Data systems", "#3e9690", "#7cbbb4", (3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 22)),
    ("Cloud computing", "#759b67", "#a1be8d", (1, 1, 2, 2, 3, 4, 4, 5, 7, 9, 12, 15, 14)),
    ("Research methods", "#bf8f55", "#d2b27e", (2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 9, 10, 9)),
    ("Other", "#a7afbd", "#a2adbd", (1, 2, 1, 2, 3, 3, 3, 4, 5, 6, 8, 9, 7)),
)


def _rgba(color: str, opacity: float) -> str:
    return f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, {opacity})"


def build_reference_library_option(
    *, font_family: str | None = None, theme: str = "light"
) -> dict:
    """Return a fresh, JSON-serializable reference-library timeline option.

    Designed for a roughly 900 x 570 chart, with a compact layout for the
    plugin's 350-pixel AI canvas. All six collections and the zoom overview
    remain visible in that compact layout.
    """
    if theme not in ("light", "dark"):
        raise ValueError("theme must be 'light' or 'dark'")
    dark = theme == "dark"
    foreground = "#e0e5eb" if dark else "#344052"
    secondary = "#9faab9" if dark else "#788394"
    grid_color = "#343b46" if dark else "#e9edf2"
    axis_color = "#46505d" if dark else "#dce3eb"
    palette = [collection[2 if dark else 1] for collection in COLLECTIONS]
    total = sum(sum(collection[3]) for collection in COLLECTIONS)
    text_style = {"color": foreground, "fontSize": 12}
    if font_family:
        text_style["fontFamily"] = font_family

    series = []
    for index, (name, _light, _dark, values) in enumerate(COLLECTIONS):
        color = palette[index]
        series.append({
            "name": name,
            "type": "line",
            "data": list(values),
            "smooth": 0.32,
            "smoothMonotone": "x",
            "symbol": "circle",
            "symbolSize": 6,
            "showSymbol": False,
            "lineStyle": {"width": 2.25, "color": color},
            "itemStyle": {"color": color},
            "areaStyle": {
                "color": {
                    "type": "linear", "x": 0, "y": 0, "x2": 0, "y2": 1,
                    "colorStops": [
                        {"offset": 0, "color": _rgba(color, 0.16 if dark else 0.12)},
                        {"offset": 1, "color": _rgba(color, 0.015)},
                    ],
                },
            },
            "emphasis": {"focus": "series", "lineStyle": {"width": 3}},
        })

    return {
        "animation": False,
        "backgroundColor": "transparent",
        "color": palette,
        "textStyle": text_style,
        "aria": {
            "enabled": True,
            "label": {"description": f"A fictional reference library of {total} papers, organized into six research collections by publication year from 2014 through 2026."},
        },
        "title": {
            "text": "Reference library",
            "subtext": f"{total} papers  /  publication year & collection",
            "left": "center", "top": 14, "itemGap": 8,
            "textStyle": {"fontSize": 22, "fontWeight": 600, "color": foreground},
            "subtextStyle": {"fontSize": 12, "color": secondary},
        },
        "grid": {"left": 48, "right": 26, "top": 94, "bottom": 120},
        "tooltip": {
            "trigger": "axis", "confine": True, "order": "valueDesc",
            "backgroundColor": "#252a31" if dark else "#ffffff",
            "borderColor": axis_color, "borderWidth": 1,
            "padding": [10, 12],
            "textStyle": {"color": foreground, "fontSize": 12},
            "axisPointer": {"type": "line", "lineStyle": {"type": "dashed", "width": 1, "color": secondary}},
        },
        "xAxis": {
            "type": "category", "data": list(YEARS), "boundaryGap": False,
            "axisLine": {"lineStyle": {"color": axis_color}},
            "axisTick": {"show": False},
            "axisLabel": {"color": secondary, "fontSize": 11, "margin": 12},
            "splitLine": {"show": False},
        },
        "yAxis": {
            "type": "value", "min": 0, "max": 40, "interval": 10,
            "name": "Papers", "nameGap": 18,
            "nameTextStyle": {"color": secondary, "fontSize": 11, "align": "right", "padding": [0, 8, 0, 0]},
            "axisLine": {"show": False}, "axisTick": {"show": False},
            "axisLabel": {"color": secondary, "fontSize": 11, "margin": 12},
            "splitLine": {"show": True, "lineStyle": {"color": grid_color, "type": "dashed", "width": 1}},
        },
        "legend": {
            "left": "center", "bottom": 70,
            "data": [collection[0] for collection in COLLECTIONS],
            "icon": "roundRect", "itemWidth": 14, "itemHeight": 3,
            "itemGap": 19,
            "textStyle": {"fontSize": 11, "color": secondary},
            "inactiveColor": "#59616d" if dark else "#cdd3dc",
            "selectedMode": True,
        },
        "dataZoom": [
            {
                "type": "slider", "xAxisIndex": 0, "start": 0, "end": 100,
                "left": 48, "right": 26, "bottom": 22, "height": 24,
                "showDetail": False, "showDataShadow": True,
                "brushSelect": False, "moveHandleSize": 0,
                "borderColor": axis_color,
                "backgroundColor": "#242a33" if dark else "#f4f6fa",
                "fillerColor": "rgba(128,165,220,0.10)" if dark else "rgba(72,118,189,0.08)",
                "handleSize": "86%",
                "handleStyle": {"color": palette[0], "borderWidth": 0},
                "dataBackground": {
                    "lineStyle": {"color": secondary, "opacity": 0.3},
                    "areaStyle": {"color": secondary, "opacity": 0.05},
                },
                "selectedDataBackground": {
                    "lineStyle": {"color": palette[0], "opacity": 0.65, "width": 1},
                    "areaStyle": {"color": palette[0], "opacity": 0.08},
                },
            },
            {"type": "inside", "xAxisIndex": 0, "start": 0, "end": 100, "zoomOnMouseWheel": "ctrl", "moveOnMouseWheel": False},
        ],
        "series": series,
        "media": [
            {
                "query": {"maxHeight": 400},
                "option": {
                    "title": {"top": 8, "itemGap": 6, "textStyle": {"fontSize": 18}, "subtextStyle": {"fontSize": 11}},
                    "grid": {"top": 78, "bottom": 92},
                    "legend": {"bottom": 48},
                    "dataZoom": [{"bottom": 12, "height": 20}, {}],
                },
            },
            {
                "query": {"maxWidth": 680},
                "option": {
                    "title": {"textStyle": {"fontSize": 18}, "subtextStyle": {"fontSize": 11}},
                    "grid": {"left": 40, "right": 20, "bottom": 118},
                    "legend": {
                        "left": "center", "bottom": 48, "itemGap": 12,
                        "textStyle": {"fontSize": 10},
                        "data": [collection[0] for collection in COLLECTIONS[:3]] + ["\n"] + [collection[0] for collection in COLLECTIONS[3:]],
                    },
                    "dataZoom": [{"left": 40, "right": 20}, {}],
                },
            },
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--theme", choices=("light", "dark"), default="light")
    parser.add_argument("--font-family", help="Resolved Obsidian interface font family")
    args = parser.parse_args()
    print(json.dumps(build_reference_library_option(font_family=args.font_family, theme=args.theme), indent=2))
