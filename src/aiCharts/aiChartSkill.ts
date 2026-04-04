import type { App } from 'obsidian';

export const AI_CHART_SKILL_DIR = 'bases-charts-ai';
const SKILL_PATH = `.claude/skills/${AI_CHART_SKILL_DIR}/SKILL.md`;

const SKILL_CONTENT = `---
name: bases-charts-ai
description: Generate ECharts configurations for AI Chart views in Obsidian Bases. Use when the user wants to create, update, or modify an AI-powered chart in a .base file.
---

# AI Chart Skill

Generate ECharts option configurations for the Bases Charts plugin's AI Chart view.

## How it works

The AI Chart view reads an \`echarts-option\` key from a .base file view config and passes it directly to \`echarts.setOption()\` for rendering. You generate the chart configuration as YAML and write it to the .base file. The full ECharts library is loaded (not tree-shaken), so all chart types and components are available.

## Steps

1. **Identify the target view** — run the \`hostname\` command to get the device name, then read the file \`.claude/ipc/bases-charts-{hostname}.json\` (replacing \`{hostname}\` with the result) to get \`activeAiView.viewName\`. If the file doesn't exist, ask the user to open an AI Chart view in Obsidian first.
2. **Read the .base file** to understand the data scope (filters, properties, formulas, existing views). The user will tell you which .base file to work with.
3. **Read the vault data** if needed — query relevant notes to understand what data is available.
4. **Generate a valid ECharts option** as nested YAML based on what the user wants to visualize.
5. **Write the option** as the \`echarts-option\` key under the view whose \`name\` matches \`viewName\` in the .base file.
6. **Validate** the YAML is syntactically correct before writing.
7. **Preserve** all other views and settings in the .base file.

## .base file format

\`\`\`yaml
views:
  - type: chart-ai
    name: My Chart
    echarts-option:
      xAxis:
        type: category
        data: [Jan, Feb, Mar, Apr]
      yAxis:
        type: value
      series:
        - type: bar
          name: Revenue
          data: [120, 200, 150, 300]
          itemStyle:
            color: "#5470c6"
\`\`\`

## Top-level option properties

### title
Chart title. Key properties: \`text\`, \`subtext\`, \`left\` (left/center/right/number), \`top\`, \`textStyle\` ({ fontSize, color, fontWeight }).

### grid
Chart area layout, important when using axes.
- \`left\`, \`right\`, \`top\`, \`bottom\` — margins (number or percentage string)
- \`containLabel: true\` — include axis labels in the grid area (recommended)

### xAxis / yAxis
Axis configuration. Can be an object or array (for dual axes).
- \`type\` — \`category\` (discrete labels), \`value\` (numeric), \`time\` (date/time), \`log\` (logarithmic)
- \`data\` — array of category labels (required for \`type: category\`)
- \`name\` — axis label text
- \`nameLocation\` — \`start\`, \`center\`, \`end\`
- \`min\`, \`max\` — axis range (number or \`dataMin\`/\`dataMax\`)
- \`axisLabel\` — { rotate, formatter, fontSize }
- \`splitLine\` — { show: true/false, lineStyle }
- \`inverse: true\` — flip the axis

### tooltip
Hover tooltips.
- \`trigger\` — \`item\` (single data point, best for pie/scatter), \`axis\` (all series at position, best for line/bar), \`none\`
- \`axisPointer\` — { type: \`line\`/\`cross\`/\`shadow\` }
- \`confine: true\` — keep tooltip within chart area
- \`formatter\` — NOT supported (YAML cannot represent functions; use default formatting)

### legend
Series legend.
- \`data\` — array of series names (auto-detected if omitted)
- \`type\` — \`plain\` or \`scroll\` (for many items)
- \`orient\` — \`horizontal\` or \`vertical\`
- \`left\`, \`top\`, \`right\`, \`bottom\` — position

### color
Global color palette as an array of hex colors. Each series uses the next color. Example:
\`\`\`yaml
color: ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de"]
\`\`\`

### visualMap
Maps data values to visual properties (color, size). Used with heatmap, scatter, etc.
- \`type\` — \`continuous\` or \`piecewise\`
- \`min\`, \`max\` — data range
- \`inRange\` — { color: [lowColor, highColor] }
- \`calculable: true\` — allow user to drag range

### dataZoom
Interactive zoom on axes.
- \`type\` — \`slider\` (visible bar) or \`inside\` (scroll/pinch)
- \`xAxisIndex\` / \`yAxisIndex\` — which axis to control
- \`start\`, \`end\` — initial range as percentage (0-100)

### graphic
Custom drawing elements (text, shapes, images) overlaid on the chart.
- \`type\` — \`text\`, \`rect\`, \`circle\`, \`line\`, \`image\`, \`group\`
- \`left\`, \`top\` — position
- \`style\` — element-specific styling

## Series types reference

### line
Line/area chart. Key properties:
- \`smooth: true\` — curved line (or number 0-1 for smoothness)
- \`areaStyle\` — fill area below line ({ opacity: 0.3 })
- \`step\` — step line (\`start\`, \`middle\`, \`end\`)
- \`stack\` — stack name for stacked areas
- \`connectNulls: true\` — bridge null gaps
- \`symbol\` — marker shape (\`circle\`, \`rect\`, \`triangle\`, \`diamond\`, \`none\`)
- \`symbolSize\` — marker size (default: 4)
- \`lineStyle\` — { width, type: solid/dashed/dotted, color }
- \`label\` — { show: true, position: top }
- \`emphasis\` — { focus: \`series\` } to dim other series on hover

### bar
Bar/column chart. Key properties:
- \`stack\` — stack name for stacked bars
- \`barWidth\` — bar width (number or percentage like \`60%\`)
- \`barGap\` — gap between bars of different series (\`30%\`, \`-100%\` for overlap)
- \`showBackground: true\` — show background bars
- \`itemStyle\` — { color, borderRadius: [topLeft, topRight, bottomRight, bottomLeft] }
- \`label\` — { show: true, position: \`top\`/\`inside\`/\`right\` }
- \`realtimeSort: true\` — bar race animation

### scatter
Scatter/bubble chart. Key properties:
- \`symbolSize\` — marker size (number, or use encode for bubble)
- \`symbol\` — marker shape
- \`itemStyle\` — { color, opacity: 0.8 }
- \`emphasis\` — { scale: true }
- \`label\` — { show: true, position: \`top\`, formatter: not supported in YAML }

### pie
Pie/donut chart. Does NOT use xAxis/yAxis. Key properties:
- \`radius\` — outer radius (\`75%\`) or [inner, outer] for donut (\`[40%, 70%]\`)
- \`center\` — position (\`[50%, 50%]\`)
- \`roseType\` — \`radius\` or \`area\` for nightingale chart
- \`startAngle\` — starting angle in degrees (default: 90)
- \`label\` — { show: true, position: \`outside\`/\`inside\`/\`center\` }
- \`labelLine\` — { show: true } guide lines
- \`emphasis\` — { scaleSize: 10 }
- \`data\` — array of { name, value } objects
- \`itemStyle\` — { borderRadius: 4, borderColor: "#fff", borderWidth: 2 }
- \`selectedMode\` — \`single\` or \`multiple\`
- \`padAngle\` — gap between sectors in degrees

### radar
Radar/spider chart. Requires a \`radar\` component instead of axes.
\`\`\`yaml
radar:
  indicator:
    - { name: Sales, max: 100 }
    - { name: Admin, max: 100 }
    - { name: Tech, max: 100 }
series:
  - type: radar
    data:
      - { name: Team A, value: [80, 90, 70] }
      - { name: Team B, value: [60, 70, 85] }
\`\`\`

### heatmap
Requires \`visualMap\`. Data format: [x, y, value].
\`\`\`yaml
series:
  - type: heatmap
    data: [[0, 0, 5], [0, 1, 10], [1, 0, 15]]
    label:
      show: true
\`\`\`

### candlestick
Financial OHLC chart. Data format: [open, close, low, high].
\`\`\`yaml
xAxis:
  type: category
  data: [Mon, Tue, Wed]
series:
  - type: candlestick
    data: [[20, 34, 10, 38], [40, 35, 30, 50], [31, 38, 33, 44]]
\`\`\`

### gauge
Gauge/meter chart. No axes needed.
- \`min\`, \`max\` — range
- \`detail\` — { formatter: not supported in YAML }
- \`data\` — [{ value: 75, name: Score }]
- \`startAngle\`, \`endAngle\` — arc range

### funnel
Funnel chart. No axes needed.
- \`left\`, \`width\` — layout
- \`sort\` — \`descending\`, \`ascending\`, \`none\`
- \`data\` — [{ name: Visit, value: 100 }, { name: Buy, value: 30 }]

### treemap
Hierarchical area chart.
- \`data\` — nested [{ name, value, children: [...] }]
- \`leafDepth\` — drill-down depth

### sunburst
Hierarchical radial chart.
- \`data\` — nested [{ name, value, children: [...] }]
- \`radius\` — [inner, outer]

### graph
Network/relationship graph.
- \`data\` — nodes [{ name, value, category }]
- \`links\` — edges [{ source, target, value }]
- \`categories\` — [{ name }]
- \`layout\` — \`force\`, \`circular\`, \`none\`
- \`force\` — { repulsion: 100, edgeLength: 50 }

### sankey
Flow diagram.
- \`data\` — nodes [{ name }]
- \`links\` — [{ source, target, value }]
- \`orient\` — \`horizontal\` or \`vertical\`

### boxplot
Box-and-whisker plot. Data format: [min, Q1, median, Q3, max].

### parallel
Parallel coordinates. Requires \`parallelAxis\` array.

## Common styling patterns

### itemStyle (on series or data items)
\`\`\`yaml
itemStyle:
  color: "#5470c6"
  borderColor: "#333"
  borderWidth: 1
  borderRadius: 4
  opacity: 0.8
  shadowBlur: 10
  shadowColor: "rgba(0,0,0,0.3)"
\`\`\`

### lineStyle
\`\`\`yaml
lineStyle:
  color: "#5470c6"
  width: 2
  type: dashed  # solid, dashed, dotted
\`\`\`

### emphasis (hover state)
\`\`\`yaml
emphasis:
  focus: series     # dim other series
  blurScope: global # or coordinateSystem
  itemStyle:
    borderWidth: 2
    shadowBlur: 10
\`\`\`

## YAML rules

- The \`echarts-option\` value is passed directly to \`echarts.setOption()\`
- Do NOT include JavaScript functions — YAML cannot represent them. This means \`formatter\`, \`labelFormatter\`, and callback-based properties will not work. Use ECharts' built-in string template formatters where available.
- Quote strings containing YAML special characters (\`:\`, \`#\`, \`[\`, \`]\`, \`{\`, \`}\`, etc.)
- Numbers and booleans don't need quotes
- Always read the existing .base file before modifying to preserve other views and settings
- Keep data arrays reasonable in size for readability

## Full ECharts reference

https://echarts.apache.org/en/option.html
`;

const SYSTEM_PROMPT_HINT = 'When the user provides a .base file and wants to generate or modify a chart, use the bases-charts-ai skill.';
const CLAUDIAN_SETTINGS_PATH = '.claude/claudian-settings.json';

export interface SkillStatus {
	skillInstalled: boolean;
	systemPromptConfigured: boolean;
}

export async function checkSkillStatus(app: App): Promise<SkillStatus> {
	const adapter = app.vault.adapter;
	const skillInstalled = await adapter.exists(SKILL_PATH);
	let systemPromptConfigured = false;
	try {
		const raw = await adapter.read(CLAUDIAN_SETTINGS_PATH);
		const settings = JSON.parse(raw) as Record<string, unknown>;
		const prompt = (settings.systemPrompt as string) ?? '';
		systemPromptConfigured = prompt.includes('bases-charts-ai');
	} catch {
		// file missing or invalid
	}
	return { skillInstalled, systemPromptConfigured };
}

export async function installSkill(app: App): Promise<void> {
	const dirPath = `.claude/skills/${AI_CHART_SKILL_DIR}`;
	if (!(await app.vault.adapter.exists(dirPath))) {
		await app.vault.adapter.mkdir(dirPath);
	}
	await app.vault.adapter.write(SKILL_PATH, SKILL_CONTENT);
	await ensureSystemPromptHint(app);
}

async function ensureSystemPromptHint(app: App): Promise<void> {
	const adapter = app.vault.adapter;

	if (!(await adapter.exists(CLAUDIAN_SETTINGS_PATH))) {
		throw new Error(`Claudian settings not found at ${CLAUDIAN_SETTINGS_PATH}. Please install Claudian first.`);
	}

	const raw = await adapter.read(CLAUDIAN_SETTINGS_PATH);
	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error(`Failed to parse ${CLAUDIAN_SETTINGS_PATH}. Please fix the file manually.`);
	}

	const existing = (settings.systemPrompt as string) ?? '';
	if (existing.includes('bases-charts-ai')) return;

	settings.systemPrompt = existing
		? `${existing}\n\n${SYSTEM_PROMPT_HINT}`
		: SYSTEM_PROMPT_HINT;

	await adapter.write(CLAUDIAN_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
