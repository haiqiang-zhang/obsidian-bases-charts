import type { GridComponentOption } from 'echarts';

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
	background: string;
}

export function resolveColors(containerEl: HTMLElement): ResolvedColors {
	const style = getComputedStyle(containerEl);
	return {
		palette: COLOR_VAR_NAMES.map(v => style.getPropertyValue(v).trim() || '#888'),
		text: style.getPropertyValue('--text-normal').trim() || '#333',
		grid: style.getPropertyValue('--background-modifier-border').trim() || '#ddd',
		accent: style.getPropertyValue('--color-accent').trim() || '#7c3aed',
		background: style.getPropertyValue('--background-primary').trim() || '#fff',
	};
}

export const OBSIDIAN_COLOR_PALETTE = [
	'var(--color-blue)',
	'var(--color-orange)',
	'var(--color-red)',
	'var(--color-cyan)',
	'var(--color-green)',
	'var(--color-yellow)',
	'var(--color-purple)',
	'var(--color-pink)',
];

export function gridOption(extraBottom = 0): GridComponentOption {
	return {
		left: 0,
		right: 0,
		top: 30,
		bottom: 20 + extraBottom,
		// ECharts 6 replaces containLabel with precise outer-bounds layout.
		// Keep the existing label containment and spacing for axis names.
		outerBoundsMode: 'same',
		outerBoundsContain: 'axisLabel',
	};
}

export function getResolvedColor(palette: string[], accent: string, groupIndex: number, isGrouped: boolean): string {
	if (!isGrouped) return accent;
	return palette[groupIndex % palette.length];
}
