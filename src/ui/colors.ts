import type { GridComponentOption } from 'echarts';
import { getPaletteColors } from './chartPalettes';

export interface ResolvedColors {
	palette: string[];
	text: string;
	grid: string;
	accent: string;
	background: string;
}

export function resolveColors(containerEl: HTMLElement, paletteId?: unknown): ResolvedColors {
	const style = containerEl.win.getComputedStyle(containerEl);
	const isDark = containerEl.doc.body.classList.contains('theme-dark');
	const palette = getPaletteColors(paletteId, isDark);
	return {
		palette,
		text: style.getPropertyValue('--text-normal').trim() || '#333',
		grid: style.getPropertyValue('--background-modifier-border').trim() || '#ddd',
		accent: palette[0],
		background: style.getPropertyValue('--background-primary').trim() || '#fff',
	};
}

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
