import type { GridComponentOption } from 'echarts';
import { getPaletteColors } from './chartPalettes';
import { getChartStyle } from './chartStyle';

export interface ResolvedColors {
	palette: string[];
	text: string;
	mutedText?: string;
	grid: string;
	accent: string;
	background: string;
}

export function resolveColors(containerEl: HTMLElement, paletteId?: unknown): ResolvedColors {
	const style = getChartStyle(containerEl);
	const isDark = containerEl.doc.body.classList.contains('theme-dark');
	const palette = getPaletteColors(paletteId, isDark);
	return {
		palette,
		text: style.getPropertyValue('--text-normal').trim() || '#333',
		mutedText: style.getPropertyValue('--text-muted').trim() || style.getPropertyValue('--text-normal').trim() || '#666',
		grid: style.getPropertyValue('--background-modifier-border').trim() || '#ddd',
		accent: palette[0],
		background: style.getPropertyValue('--background-primary').trim() || '#fff',
	};
}

export function gridOption(): GridComponentOption {
	return {
		left: 8,
		right: 12,
		top: 12,
		bottom: 12,
		// Let ECharts 6 contain both labels and titles once, including on resize.
		outerBoundsMode: 'same',
		outerBoundsContain: 'all',
	};
}

export function getResolvedColor(palette: string[], accent: string, groupIndex: number, isGrouped: boolean): string {
	if (!isGrouped) return accent;
	return palette[groupIndex % palette.length];
}
