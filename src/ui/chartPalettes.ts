export type ChartPaletteKind = 'categorical' | 'sequential';

export interface ChartPalette {
	readonly id: string;
	readonly name: string;
	readonly kind: ChartPaletteKind;
	readonly light: readonly string[];
	readonly dark: readonly string[];
}

export const DEFAULT_CHART_PALETTE = 'auto';

// Concrete sRGB colors are intentional: ECharts' emphasis and animation parser
// cannot resolve CSS variables, OKLCH, or color-mix(). Matching hue order keeps
// series identities stable when the owning window changes theme.
export const CHART_PALETTES: readonly ChartPalette[] = Object.freeze(([
	{
		id: DEFAULT_CHART_PALETTE,
		name: 'Auto',
		kind: 'categorical',
		light: ['#6B8EAD', '#88A28A', '#C0A269', '#BA8774', '#9C8AA5', '#74A29E', '#B68D9B', '#9B958B'],
		dark: ['#8BA9C3', '#A0B69E', '#CCB47E', '#CC9A87', '#B2A0BB', '#91B8B3', '#C5A1AE', '#ADA79D'],
	},
	{
		id: 'colorful',
		name: 'Colorful',
		kind: 'categorical',
		light: ['#5785B1', '#6D9875', '#B99A4F', '#C27A62', '#A17FB1', '#5A9F9A', '#BF829A', '#BD6E69'],
		dark: ['#88B0D2', '#9BBDA0', '#D0B575', '#D6A08A', '#BCA0C9', '#8DBFB9', '#D1A2B4', '#D59B96'],
	},
	{
		id: 'earth',
		name: 'Earth',
		kind: 'categorical',
		light: ['#B37660', '#858B5E', '#B19550', '#8C7060', '#7B987C', '#A36B58', '#9C8C79', '#9A7C85'],
		dark: ['#CEA08B', '#AFB184', '#CEB77D', '#B49B88', '#A3B8A0', '#C6937D', '#BDB09C', '#BCA0A7'],
	},
	{
		id: 'coastal',
		name: 'Coastal',
		kind: 'categorical',
		light: ['#476C89', '#5D9795', '#B2A078', '#7197B6', '#7F9F8E', '#7D889D', '#B68E7C', '#8A9DA8'],
		dark: ['#83A5C0', '#8CBAB6', '#CFBF99', '#9AB8D0', '#A2BDAC', '#A2AEC2', '#CFAD98', '#ADBFC9'],
	},
	// Sequential palettes move from a recognizable main color to soft tints on
	// light backgrounds, and from light to deeper shades on dark backgrounds.
	// The first shade remains the strongest against the background in each theme.
	{
		id: 'gray',
		name: 'Colorless',
		kind: 'sequential',
		light: ['#70706D', '#7E7E7B', '#8D8D89', '#9B9B97', '#A9A9A6', '#B7B7B4', '#C6C6C2', '#D4D4D0'],
		dark: ['#ACACAC', '#A3A3A3', '#9A9A9A', '#919191', '#888888', '#808080', '#777777', '#6E6E6E'],
	},
	{
		id: 'blue',
		name: 'Blue',
		kind: 'sequential',
		light: ['#5E86AC', '#6D92B4', '#7D9DBC', '#8CA9C4', '#9CB5CD', '#ABC1D5', '#BBCCDD', '#CAD8E5'],
		dark: ['#90AFC8', '#84A6C2', '#789EBD', '#6C95B7', '#608CB1', '#5484AB', '#4E7B9F', '#487193'],
	},
	{
		id: 'green',
		name: 'Green',
		kind: 'sequential',
		light: ['#5E9673', '#6DA080', '#7CAA8D', '#8BB49A', '#99BFA7', '#A8C9B4', '#B7D3C1', '#C6DDCE'],
		dark: ['#97C1A8', '#8CBA9F', '#81B395', '#76AD8C', '#6BA682', '#609F79', '#599471', '#528968'],
	},
	{
		id: 'yellow',
		name: 'Yellow',
		kind: 'sequential',
		light: ['#C4A351', '#C9AB5F', '#CEB46E', '#D3BC7C', '#D9C48B', '#DECC99', '#E3D5A8', '#E8DDB6'],
		dark: ['#D4BD84', '#CFB677', '#CBAF6A', '#C6A85D', '#C1A150', '#BD9A42', '#AF8F3E', '#A28439'],
	},
	{
		id: 'purple',
		name: 'Purple',
		kind: 'sequential',
		light: ['#9B7DB4', '#A489BB', '#AE95C3', '#B7A1CA', '#C1ACD1', '#CAB8D8', '#D4C4E0', '#DDD0E7'],
		dark: ['#BCA8CB', '#B49DC4', '#AB92BD', '#A387B7', '#9A7BB0', '#9270A9', '#8965A3', '#805C9A'],
	},
	{
		id: 'teal',
		name: 'Teal',
		kind: 'sequential',
		light: ['#5E9C9B', '#6DA5A4', '#7BAFAD', '#8AB8B6', '#98C2C0', '#A7CBC9', '#B5D5D2', '#C4DEDB'],
		dark: ['#93C5C4', '#88BFBE', '#7CB8B7', '#70B2B1', '#65ACAB', '#59A6A4', '#539A99', '#4D8F8D'],
	},
	{
		id: 'orange',
		name: 'Orange',
		kind: 'sequential',
		light: ['#CA8B60', '#CF956D', '#D39E7A', '#D8A887', '#DCB293', '#E1BCA0', '#E5C5AD', '#EACFBA'],
		dark: ['#CDA58B', '#C89C7E', '#C39272', '#BD8965', '#B87F59', '#B2754D', '#A66D47', '#9A6542'],
	},
	{
		id: 'pink',
		name: 'Pink',
		kind: 'sequential',
		light: ['#BA7F9B', '#C08AA4', '#C796AD', '#CDA1B6', '#D3ACBF', '#D9B7C8', '#E0C3D1', '#E6CEDA'],
		dark: ['#CAA1B4', '#C496AB', '#BD8AA1', '#B77F98', '#B1748F', '#AA6886', '#A45D7D', '#995674'],
	},
	{
		id: 'red',
		name: 'Red',
		kind: 'sequential',
		light: ['#C17B73', '#C7867F', '#CC928B', '#D29D97', '#D7A9A3', '#DDB4AF', '#E2C0BB', '#E8CBC7'],
		dark: ['#D29F9B', '#CC948E', '#C78882', '#C17C76', '#BC7069', '#B6655D', '#B15951', '#A5524A'],
	},
] satisfies ChartPalette[]).map(palette => Object.freeze({
	...palette,
	light: Object.freeze(palette.light),
	dark: Object.freeze(palette.dark),
})));

export function getChartPalette(value: unknown): ChartPalette {
	return CHART_PALETTES.find(palette => palette.id === value) ?? CHART_PALETTES[0];
}

export function getPaletteColors(value: unknown, isDark: boolean): string[] {
	const palette = getChartPalette(value);
	return [...(isDark ? palette.dark : palette.light)];
}
