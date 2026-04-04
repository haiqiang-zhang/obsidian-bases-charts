import type { App } from 'obsidian';

export const AI_CHART_SKILL_DIR = 'bases-charts-ai';
const SKILL_PATH = `.claude/skills/${AI_CHART_SKILL_DIR}/SKILL.md`;

const SKILL_CONTENT = `---
name: bases-charts-ai
description: Generate ECharts configurations for AI Chart views in Obsidian Bases. Use when the user wants to create, update, or modify an AI-powered chart in a .base file.
---

# AI Chart Skill

Generate ECharts option JSON for the Bases Charts plugin's AI Chart view.

## How it works

The AI Chart view in the Bases Charts plugin reads an \`echarts-option\` key from a .base file view config and passes it directly to Apache ECharts for rendering. You generate the chart configuration and write it to the .base file.

## Steps

1. **Read the .base file** to understand the data scope (filters, properties, formulas, existing views)
2. **Read the vault data** if needed — query relevant notes to understand what data is available
3. **Generate a valid ECharts option** as a YAML object based on what the user wants to visualize
4. **Write the option** as the \`echarts-option\` key under the \`chart-ai\` type view in the .base file
5. **Validate** the YAML is syntactically correct before writing

## .base file format

The AI Chart view is defined as a view with \`type: chart-ai\`. The \`echarts-option\` key holds the full ECharts option object as nested YAML.

\`\`\`yaml
views:
  - type: chart-ai
    name: AI Chart
    echarts-option:
      title:
        text: Monthly Sales
      xAxis:
        type: category
        data:
          - Jan
          - Feb
          - Mar
      yAxis:
        type: value
      series:
        - type: bar
          data:
            - 120
            - 200
            - 150
\`\`\`

## Supported chart types

ECharts supports many chart types in the \`series.type\` field:
- \`bar\` — bar/column charts
- \`line\` — line charts
- \`scatter\` — scatter plots
- \`pie\` — pie/donut charts
- \`radar\` — radar charts
- \`heatmap\` — heatmaps
- \`treemap\` — treemaps
- \`sunburst\` — sunburst charts
- \`graph\` — network graphs
- \`gauge\` — gauge charts
- \`funnel\` — funnel charts
- \`sankey\` — sankey diagrams
- \`boxplot\` — box plots
- \`candlestick\` — candlestick charts
- \`parallel\` — parallel coordinates
- And more: https://echarts.apache.org/en/option.html#series

## Common option properties

- \`title\` — chart title (\`text\`, \`subtext\`, \`left\`, \`top\`)
- \`xAxis\` / \`yAxis\` — axis config (\`type\`: category/value/time/log, \`data\`, \`name\`)
- \`series\` — array of data series (\`type\`, \`data\`, \`name\`, styling)
- \`tooltip\` — hover tooltips (\`trigger\`: item/axis)
- \`legend\` — series legend
- \`grid\` — chart area layout (\`left\`, \`right\`, \`top\`, \`bottom\`, \`containLabel\`)
- \`color\` — color palette array
- \`visualMap\` — visual mapping for heatmaps etc.

## YAML guidelines

- Quote strings containing YAML special characters (\`:\`, \`#\`, \`[\`, \`]\`, etc.)
- Use arrays with \`-\` syntax for data and series
- Numbers don't need quotes
- Booleans: \`true\` / \`false\`
- Keep the option structure clean and readable

## Important notes

- The \`echarts-option\` value is passed directly to \`echarts.setOption()\` — it must be a valid ECharts option
- The plugin handles chart initialization, resizing, and theme colors
- Do NOT include JavaScript functions in the option (YAML can't represent functions)
- Keep data arrays reasonable in size for .base file readability
- Always read the existing .base file before modifying to preserve other views and settings

## Full ECharts reference

https://echarts.apache.org/en/option.html
`;

export function isSkillInstalled(app: App): boolean {
	return app.vault.adapter.exists(SKILL_PATH) instanceof Promise
		? false // Fallback — check synchronously if possible
		: false;
}

export async function checkSkillInstalled(app: App): Promise<boolean> {
	return app.vault.adapter.exists(SKILL_PATH);
}

export async function installSkill(app: App): Promise<void> {
	const dirPath = `.claude/skills/${AI_CHART_SKILL_DIR}`;
	if (!(await app.vault.adapter.exists(dirPath))) {
		await app.vault.adapter.mkdir(dirPath);
	}
	await app.vault.adapter.write(SKILL_PATH, SKILL_CONTENT);
}
