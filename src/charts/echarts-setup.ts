import * as echarts from 'echarts/core';
import { ScatterChart, LineChart, BarChart, PieChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, GraphicComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([ScatterChart, LineChart, BarChart, PieChart, TooltipComponent, GridComponent, GraphicComponent, LegendComponent, CanvasRenderer]);

export { echarts };

const COLOR_VAR_NAMES = [
	'--color-blue',
	'--color-orange',
	'--color-red',
	'--color-cyan',
	'--color-green',
	'--color-yellow',
	'--color-purple',
	'--color-pink',
];

export interface ResolvedColors {
	palette: string[];
	text: string;
	grid: string;
	accent: string;
}

export function resolveColors(containerEl: HTMLElement): ResolvedColors {
	const style = getComputedStyle(containerEl);
	return {
		palette: COLOR_VAR_NAMES.map(v => style.getPropertyValue(v).trim() || '#888'),
		text: style.getPropertyValue('--text-normal').trim() || '#333',
		grid: style.getPropertyValue('--background-modifier-border').trim() || '#ddd',
		accent: style.getPropertyValue('--color-accent').trim() || '#7c3aed',
	};
}

export const GRID_OPTION = { left: 0, right: 0, top: 30, bottom: 20, containLabel: true } as const;

export function getResolvedColor(palette: string[], accent: string, groupIndex: number, isGrouped: boolean): string {
	if (!isGrouped) return accent;
	return palette[groupIndex % palette.length];
}
