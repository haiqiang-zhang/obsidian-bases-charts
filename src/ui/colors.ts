import type { GridComponentOption } from 'echarts';

// Muted categorical colors, independent of the host's status and UI accents.
// Keep the same hue order in both themes so group identities survive a switch.
// Concrete hex values also work with ECharts' hover and animation color parser.
const LIGHT_PALETTE = [
	'#6B8EAD', // Dusty blue
	'#88A28A', // Sage
	'#C0A269', // Sand
	'#BA8774', // Clay
	'#9C8AA5', // Plum
	'#74A29E', // Teal
	'#B68D9B', // Rose
	'#9B958B', // Stone
];

const DARK_PALETTE = [
	'#8BA9C3',
	'#A0B69E',
	'#CCB47E',
	'#CC9A87',
	'#B2A0BB',
	'#91B8B3',
	'#C5A1AE',
	'#ADA79D',
];

export interface ResolvedColors {
	palette: string[];
	text: string;
	grid: string;
	accent: string;
	background: string;
}

export function resolveColors(containerEl: HTMLElement): ResolvedColors {
	const style = containerEl.win.getComputedStyle(containerEl);
	const isDark = containerEl.doc.body.classList.contains('theme-dark');
	const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
	return {
		palette: [...palette],
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
