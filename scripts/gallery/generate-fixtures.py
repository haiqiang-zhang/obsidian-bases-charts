#!/usr/bin/env python3
"""Generate deterministic, English-only sample notes and Bases for the UI gallery.

Run from any directory. The default output is gallery/demo-vault/Chart Gallery.
Pass --output to write the same self-contained Chart Gallery tree elsewhere.
No real personal or customer data is used. This script uses only the standard library.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
STREAMS = ["Design", "Engineering", "Research", "Writing"]
PROJECTS = ["Atlas", "Beacon", "Canvas", "Field Notes", "Launchpad", "Signal"]
WEEKLY_HOURS = {
    "Design": [14, 17, 19, 23, 21, 24, 27, 25, 29, 31, 30, 34],
    "Engineering": [19, 22, 20, 27, 29, 32, 34, 31, 38, 40, 43, 46],
    "Research": [24, 27, 23, 25, 22, 24, 20, 23, 21, 18, 20, 19],
    "Writing": [9, 11, 12, 11, 15, 16, 14, 18, 20, 19, 22, 24],
}
ACTIVITIES = {
    "Design": ["Information architecture", "Interface sketches", "Prototype review", "Design system", "Usability refinements", "Interaction details"],
    "Engineering": ["API foundations", "Search indexing", "Data migration", "Performance tuning", "Accessibility fixes", "Release preparation"],
    "Research": ["Discovery interviews", "Reading synthesis", "Field observations", "Concept evaluation", "Evidence mapping", "Research synthesis"],
    "Writing": ["Product narrative", "Getting started guide", "Release notes", "Case study draft", "Editorial review", "Documentation polish"],
}


def scalar(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return json.dumps(value, ensure_ascii=True)


def yaml_text(value, indent=0):
    """Small deterministic YAML writer for this JSON-compatible fixture schema."""
    pad = " " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            key_text = json.dumps(key) if ":" in key else key
            if isinstance(item, (dict, list)) and item:
                if isinstance(item, list) and all(not isinstance(x, (dict, list)) for x in item):
                    lines.append(f"{pad}{key_text}: {json.dumps(item)}")
                else:
                    lines.append(f"{pad}{key_text}:")
                    lines.append(yaml_text(item, indent + 2))
            else:
                lines.append(f"{pad}{key_text}: {scalar(item)}")
        return "\n".join(lines)
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                if isinstance(item, list) and all(not isinstance(x, (dict, list)) for x in item):
                    lines.append(f"{pad}- {json.dumps(item)}")
                else:
                    lines.append(f"{pad}-")
                    lines.append(yaml_text(item, indent + 2))
            else:
                lines.append(f"{pad}- {scalar(item)}")
        return "\n".join(lines)
    return f"{pad}{scalar(value)}"


def write_note(root, relative, properties, body):
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("---\n" + yaml_text(properties) + "\n---\n\n" + body + "\n", encoding="utf-8")


def write_base(root, filename, folder, views, properties=None, formulas=None):
    doc = {}
    if folder:
        doc["filters"] = {"and": [f'file.inFolder("Chart Gallery/{folder}")', 'file.ext == "md"']}
    if formulas:
        doc["formulas"] = formulas
    if properties:
        doc["properties"] = {key: {"displayName": value} for key, value in properties.items()}
    doc["views"] = views
    (root / filename).write_text(yaml_text(doc) + "\n", encoding="utf-8")


def chart_view(kind, name, x, y, palette="coastal", group=None, **extra):
    view = {"type": f"chart-{kind}", "name": name, "x": f"note.{x}", "y": [f"note.{value}" for value in y],
            "order": ["file.name", f"note.{x}"] + [f"note.{value}" for value in y], "color-palette": palette}
    if group:
        view["groupBy"] = {"property": f"note.{group}", "direction": "ASC"}
    view["sort"] = [{"property": f"note.{x}", "direction": "ASC"}]
    for value in y:
        view[f"aggregate:note.{value}"] = "None" if kind == "scatter" else "Sum"
    view.update(extra)
    return view


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=REPO / "gallery/demo-vault/Chart Gallery")
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    monday = datetime(2026, 7, 6, 9)
    activity_count = 0
    for stream_index, stream in enumerate(STREAMS):
        for week in range(12):
            weekly = WEEKLY_HOURS[stream][week]
            first_hours = round(weekly * (0.48 + 0.04 * (week % 3)) * 2) / 2
            for session, hours in enumerate([first_hours, weekly - first_hours]):
                completed = monday + timedelta(weeks=week, days=1 + session * 2, hours=stream_index * 2 + session)
                project = PROJECTS[(week + stream_index + session * 2) % len(PROJECTS)]
                activity = ACTIVITIES[stream][(week + session) % 6]
                name = f"{project} - {activity} - W{week + 1:02d}"
                deliverables = max(1, round(hours / (2.8 + stream_index * 0.4)))
                write_note(root, f"Sessions/{stream}/{name}.md", {
                    "Workstream": stream, "Project": project,
                    "Completed": completed.isoformat(timespec="minutes"),
                    "Hours": hours, "Deliverables": deliverables,
                    "Week": week + 1, "Status": "Complete", "Quarter": "Q3 2026",
                    "tags": ["chart-gallery", "sample-data"],
                }, f"# {activity}\n\n{project} studio session for week {week + 1}.\n\n"
                   f"Recorded {hours:g} hours of {stream.lower()} work and {deliverables} completed deliverables.\n\n"
                   "This is fictional sample data for the Bases Chart Views gallery.")
                activity_count += 1

    common_properties = {"note.Completed": "Date", "note.Hours": "Hours", "note.Deliverables": "Deliverables", "note.Workstream": "Workstream", "note.Project": "Project", "formula.Week label": "Week"}
    weekly = {"x-date-grouping": {"property": "note.Completed", "unit": "week"}, "min-y-override": "0"}
    trend = chart_view("line", "Weekly momentum", "Completed", ["Hours"], group="Workstream", **weekly)
    metrics = chart_view("line", "Hours & deliverables", "Completed", ["Hours", "Deliverables"], group="Workstream", **weekly)
    write_base(root, "01 Trend.base", "Sessions", [trend, metrics], common_properties,
               {"Week label": 'date(note.Completed).format("MMM D")'})
    bar = chart_view("bar", "Projects by workstream", "Project", ["Hours"], palette="earth", group="Workstream", **{"show-labels": True, "min-y-override": "0"})
    comparison = chart_view("bar", "Two measures", "Project", ["Hours", "Deliverables"], palette="coastal", **{"show-labels": True, "min-y-override": "0"})
    write_base(root, "02 Workstreams.base", "Sessions", [bar, comparison], common_properties)
    area = chart_view("area", "A season of progress", "Completed", ["Hours"], group="Workstream", **weekly)
    write_base(root, "03 Capacity.base", "Sessions", [area], common_properties)
    pie = chart_view("pie", "Where the time goes", "Workstream", ["Hours"], palette="earth", **{"show-labels": True, "show-percentages": True, "ignore-null": True})
    write_base(root, "04 Focus mix.base", "Sessions", [pie], common_properties)

    capabilities = [
        ("Discovery", 86, 65), ("Prototyping", 79, 60), ("Delivery", 92, 78),
        ("Documentation", 72, 85), ("Accessibility", 88, 64), ("Reliability", 83, 91),
    ]
    for index, (capability, current, target) in enumerate(capabilities):
        write_note(root, f"Capabilities/{capability}.md", {"Capability": capability, "Current": current, "Target": target, "Sequence": index + 1, "tags": ["chart-gallery", "sample-data"]},
                   f"# {capability}\n\nAn illustrative comparison of current and target scores on a 0-100 scale.\n\nThis is fictional sample data.")
    radar = chart_view("radar", "A balanced practice", "Capability", ["Current", "Target"], palette="coastal", **{"radar-scale": "shared", "show-fill": True})
    radar["sort"] = [{"property": "note.Sequence", "direction": "ASC"}]
    write_base(root, "05 Skills.base", "Capabilities", [radar], {"note.Capability": "Capability", "note.Current": "Current", "note.Target": "Target"})

    initiative_names = ["Navigation refresh", "Search shortcuts", "Onboarding guide", "Color accessibility", "Research repository", "API simplification", "Template library", "Release checklist"]
    effort_impact = {
        "Design": [(4, 72), (7, 81), (10, 78), (14, 88), (18, 83), (24, 91), (29, 87), (33, 95)],
        "Engineering": [(6, 52), (11, 67), (16, 64), (20, 79), (27, 82), (32, 88), (37, 92), (44, 96)],
        "Research": [(3, 42), (8, 57), (13, 71), (17, 67), (22, 81), (28, 78), (34, 86), (40, 90)],
        "Writing": [(2, 38), (5, 62), (9, 59), (12, 74), (15, 69), (19, 81), (23, 77), (26, 89)],
    }
    for stream in STREAMS:
        for index, (effort, impact) in enumerate(effort_impact[stream]):
            initiative = initiative_names[(index + STREAMS.index(stream) * 2) % len(initiative_names)]
            write_note(root, f"Initiatives/{stream}/{initiative}.md", {"Workstream": stream, "Initiative": initiative, "Effort": effort, "Impact": impact, "Status": "Evaluated", "tags": ["chart-gallery", "sample-data"]},
                       f"# {initiative}\n\nA fictional {stream.lower()} initiative with an estimated effort of {effort} hours and an impact score of {impact}/100.\n\nThis is illustrative planning data, not a measured product outcome.")
    scatter = chart_view("scatter", "Effort & impact", "Effort", ["Impact"], group="Workstream", **{"min-y-override": "0", "max-y-override": "100"})
    write_base(root, "06 Effort and impact.base", "Initiatives", [scatter], {"note.Effort": "Effort (hours)", "note.Impact": "Impact score", "note.Workstream": "Workstream"})

    # An explicitly saved ECharts option demonstrates the AI Chart renderer.
    # Opening this view still requires the normal Claudian setup in Obsidian.
    heatmap = []
    for week in range(12):
        for day in range(7):
            value = [5, 7, 6, 8, 5, 2, 1][day] + (week // 3) + ((week * 3 + day * 2) % 4) - 1
            if day > 4:
                value = max(0, value - 2)
            heatmap.append([week, day, value])
    option = {
        "animation": False,
        "backgroundColor": "#ffffff",
        "textStyle": {"fontFamily": "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", "color": "#373b3b"},
        "title": {"text": "A season of focused work", "subtext": "Hours by day  /  July - September 2026", "left": 28, "top": 24,
                  "textStyle": {"fontSize": 24, "fontWeight": 600, "color": "#303635"},
                  "subtextStyle": {"fontSize": 13, "color": "#727b78"}, "itemGap": 12},
        "grid": {"left": 88, "right": 40, "top": 126, "bottom": 96},
        "tooltip": {"position": "top", "confine": True},
        "xAxis": {"type": "category", "data": [(monday + timedelta(weeks=i)).strftime("%b %d") for i in range(12)], "splitArea": {"show": False}, "axisLine": {"show": False}, "axisTick": {"show": False}, "axisLabel": {"color": "#727b78", "margin": 14, "fontSize": 12}},
        "yAxis": {"type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "inverse": True, "axisLine": {"show": False}, "axisTick": {"show": False}, "axisLabel": {"color": "#727b78", "margin": 16, "fontSize": 12}},
        "visualMap": {"min": 0, "max": 13, "calculable": False, "orient": "horizontal", "left": "center", "bottom": 22, "itemWidth": 12, "itemHeight": 200, "text": ["More focus", "Less focus"], "textStyle": {"color": "#727b78", "fontSize": 12}, "inRange": {"color": ["#f0f4ef", "#d1dfd2", "#9ebeb0", "#679b90", "#3d726e"]}},
        "series": [{"name": "Focus hours", "type": "heatmap", "data": heatmap, "label": {"show": True, "fontSize": 12, "color": "#243e38"}, "itemStyle": {"borderWidth": 6, "borderColor": "#ffffff", "borderRadius": 5}, "emphasis": {"itemStyle": {"borderColor": "#e9eeea", "borderWidth": 3}}}],
    }
    write_base(root, "10 AI insights.base", None, [{"type": "chart-ai", "name": "Focus rhythm", "echarts-option": option}])
    (root / "Welcome.md").write_text(
        "# Chart Gallery\n\n"
        "A fictional studio's quarter, designed to show how Bases Chart Views works with ordinary Markdown properties. All data is synthetic.\n\n"
        "## Explore the views\n\n"
        "- [[01 Trend.base|Weekly momentum]] - date grouping and colored workstreams.\n"
        "- [[02 Workstreams.base|Projects by workstream]] - grouped bars and multiple measures.\n"
        "- [[03 Capacity.base|A season of progress]] - stacked area totals.\n"
        "- [[04 Focus mix.base|Where the time goes]] - a proportional overview.\n"
        "- [[05 Skills.base|A balanced practice]] - two radar profiles across six capabilities.\n"
        "- [[06 Effort and impact.base|Effort & impact]] - 32 individual initiatives.\n"
        "- [[10 AI insights.base|Focus rhythm]] - a saved ECharts heatmap in an AI Chart view.\n\n"
        "## First-time setup\n\n"
        "Install and enable Bases Chart Views. Copy this entire Chart Gallery folder into a vault. Keep its folder name so the Base filters continue to find the sample notes.\n\n"
        "Set the Completed property type to Date & time and Effort to Number in Obsidian if these types are not detected automatically. Hours, Deliverables, Impact, Current, Target, Week, and Sequence are Number properties. No vault settings are included or overwritten.\n\n"
        "The AI Chart example also requires the plugin's normal Claudian skill setup. It renders a saved configuration; it does not query the session notes live.\n\n"
        "These examples use the current development version of Bases Chart Views. Some controls and chart types may not be available in an older community release.\n",
        encoding="utf-8")
    manifest = {
        "description": "Synthetic English-only data for Bases Chart Views UI gallery",
        "period": "2026-07-06 through 2026-09-25", "sessions": activity_count, "capabilities": len(capabilities),
        "initiatives": sum(map(len, effort_impact.values())), "total_hours": sum(sum(values) for values in WEEKLY_HOURS.values()),
        "property_types": {"Completed": "datetime", "Effort": "number", "Hours": "number", "Deliverables": "number", "Impact": "number", "Current": "number", "Target": "number", "Week": "number", "Sequence": "number"},
        "views": [{"file": path.name, "name": name} for path, name in zip(sorted(root.glob("*.base")), ["Weekly momentum", "Projects by workstream", "A season of progress", "Where the time goes", "A balanced practice", "Effort & impact", "Focus rhythm"])],
    }
    (root / "fixture-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(root), **manifest}, indent=2))


if __name__ == "__main__":
    main()
