import { format } from 'echarts';
import type { EChartsOption } from 'echarts';
import type { BasesAllOptions } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import type { ResolvedColors } from '../../ui/colors';
import { toXKey } from '../../utils/utils';

export const RADAR_CHART_VIEW_TYPE = 'chart-radar';
export const RADAR_SETTINGS = {
	SCALE: 'radar-scale',
	SHOW_FILL: 'show-fill',
} as const;

export interface RadarOptions {
	scale: 'shared' | 'category';
	showFill: boolean;
}

export interface RadarSeries {
	name: string;
	property: string;
	colorIndex: number;
	chartIndex: number;
	groupIndex: number;
	points: ProcessedData[];
}

function radarViewOptions(): BasesAllOptions[] {
	return [
		...DataChartView.commonViewOptionGroups().data,
		{
			displayName: 'Scale', type: 'dropdown', key: RADAR_SETTINGS.SCALE,
			default: 'shared', options: { shared: 'Shared across categories', category: 'Per category' },
		},
		{ displayName: 'Fill areas', type: 'toggle', key: RADAR_SETTINGS.SHOW_FILL, default: true },
	];
}

/** Category identity follows Bases Sort, even for dates and numeric categories. */
export function getRadarCategories(data: DataWrapper): string[] {
	const present = new Set(data.data.filter(point => Number.isFinite(point.y)).map(point => toXKey(point.x)));
	return [...new Set([...data.sortedXOrder.filter(key => present.has(key)), ...present])];
}

/** All selected measures share one radar; native groups create further profiles. */
export function getRadarSeries(data: DataWrapper): RadarSeries[] {
	const multipleProperties = data.getChartIdentifiers().length > 1;
	const multipleGroups = data.hasMultipleGroups();
	const groupCount = Math.max(1, data.getGroupIdentifiers().length);
	return data.getChartIdentifiers().flatMap((_, chartIndex) => {
		const groups = new Map<number, ProcessedData[]>();
		for (const point of data.getFlat(chartIndex)) {
			if (!Number.isFinite(point.y)) continue;
			const points = groups.get(point.groupIndex) ?? [];
			points.push(point);
			groups.set(point.groupIndex, points);
		}
		const property = data.getChartName(chartIndex);
		return [...groups.entries()].sort(([a], [b]) => a - b).map(([groupIndex, points]) => ({
			name: multipleGroups
				? multipleProperties ? `${property} · ${data.getGroupName(groupIndex)}` : data.getGroupName(groupIndex)
				: property,
			property, chartIndex, groupIndex,
			colorIndex: chartIndex * groupCount + groupIndex,
			points,
		}));
	});
}

export class RadarChartView extends DataChartView {
	readonly type = RADAR_CHART_VIEW_TYPE;

	protected onChartLoad(): void {
		this.containerEl.addClass('bases-radar-chart-view');
		super.onChartLoad();
	}

	protected onChartUnload(): void {
		super.onChartUnload();
		this.containerEl.removeClass('bases-radar-chart-view');
	}

	getChartCount(_data: DataWrapper): number { return 1; }
	getChartData(data: DataWrapper, _chartIndex: number): ProcessedData[] { return data.data; }
	getChartLegend(data: DataWrapper): { name: string; colorIndex: number }[] { return getRadarSeries(data); }
	getChartLabel(_data: DataWrapper, _chartIndex: number): string { return 'Values'; }
	getChartMessage(data: DataWrapper, _chartIndex: number): string | null {
		return getRadarCategories(data).length < 3 ? 'Radar charts need at least three categories with values.' : null;
	}

	buildOption(data: DataWrapper, _chartIndex: number, _xName: string, _yLabel: string, _isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		return buildRadarOption(data, colors, {
			scale: this.config.get(RADAR_SETTINGS.SCALE) === 'category' ? 'category' : 'shared',
			showFill: Boolean(this.config.get(RADAR_SETTINGS.SHOW_FILL) ?? true),
		});
	}
}

export const radarChartRegistration = {
	viewType: RADAR_CHART_VIEW_TYPE,
	name: 'Radar Chart',
	icon: 'lucide-radar',
	createView: RadarChartView,
	viewOptions: radarViewOptions,
};

function roundOutward(value: number): number {
	if (value === 0) return 0;
	const step = Math.pow(10, Math.floor(Math.log10(Math.abs(value)))) / 2;
	if (!Number.isFinite(step) || step === 0) return value;
	const rounded = Math.sign(value) * Math.ceil(Math.abs(value) / step) * step;
	return Number.isFinite(rounded) ? rounded : value;
}

function indicatorRange(values: number[]): { min: number; max: number } {
	let min = 0;
	let max = 0;
	for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
	return { min: roundOutward(min), max: max === min ? 1 : roundOutward(max) };
}

export function buildRadarOption(data: DataWrapper, colors: ResolvedColors, options: RadarOptions = { scale: 'shared', showFill: true }): EChartsOption {
	const categories = getRadarCategories(data);
	if (categories.length < 3) return { series: [] };
	const profiles = getRadarSeries(data);
	const categoryLabel = (key: string) => data.xAxisType === 'time' ? new Date(key).toLocaleString() : key;
	const allValues = profiles.flatMap(profile => profile.points.map(point => point.y));
	const sharedRange = indicatorRange(allValues);
	const labelStep = Math.max(1, Math.ceil(categories.length / 12));
	const visibleNames = new Set(categories.filter((_, index) => index % labelStep === 0).map(categoryLabel));
	// Radar axis names do not honor axisName.width in ECharts 6.1. Truncate
	// their display text through ECharts, retaining full indicator identities.
	const axisName = (width: number, fontSize: number) => ({
		color: colors.mutedText ?? colors.text, fontSize,
		formatter: (name = '') => visibleNames.has(name) ? format.truncateText(name, width, `${fontSize}px sans-serif`, '…') : '',
	});
	const indicator = categories.map(key => ({
		name: categoryLabel(key),
		...(options.scale === 'shared' ? sharedRange : indicatorRange(profiles.flatMap(profile => profile.points.filter(point => toXKey(point.x) === key).map(point => point.y)))),
	}));
	const series = profiles.map(profile => {
		const byCategory = new Map(profile.points.map(point => [toXKey(point.x), point]));
		const values = categories.map(key => {
			const point = byCategory.get(key) ?? null;
			return { category: categoryLabel(key), value: point?.y ?? null, point };
		});
		const color = colors.palette[profile.colorIndex % colors.palette.length] ?? colors.accent;
		const raw: ProcessedData = {
			x: profile.name, y: 0, chartIndex: profile.chartIndex, groupIndex: profile.groupIndex,
			isNumeric: profile.points.every(point => point.isNumeric),
			files: profile.points.flatMap(point => point.files),
			fileValues: profile.points.flatMap(point => point.fileValues),
			radar: { name: profile.name, property: profile.property, values },
		};
		return {
			type: 'radar' as const,
			name: profile.name,
			data: [{ name: profile.name, value: values.map(value => value.value ?? 0), _raw: raw }],
			symbol: 'circle', symbolSize: 4,
			lineStyle: { width: 2, color },
			itemStyle: { color },
			areaStyle: { color, opacity: options.showFill ? 0.08 : 0 },
			emphasis: { focus: 'series' as const, lineStyle: { width: 2.5 }, areaStyle: { opacity: options.showFill ? 0.14 : 0 } },
			cursor: 'pointer',
		};
	});
	return {
		radar: {
			center: ['50%', '50%'], radius: '70%',
			shape: 'polygon', splitNumber: 4,
			indicator,
			axisNameGap: 10,
			axisName: axisName(112, 12),
			axisLine: { lineStyle: { color: colors.grid, opacity: 0.65 } },
			splitLine: { lineStyle: { color: colors.grid, opacity: 0.7 } },
			splitArea: { show: false },
			axisTick: { show: false }, axisLabel: { show: false },
		},
		tooltip: { trigger: 'item' },
		series,
		media: [
			{ query: { maxWidth: 519 }, option: { radar: { radius: '52%', axisNameGap: 8, axisName: axisName(60, 11) } } },
			{ query: { maxWidth: 279 }, option: { radar: { radius: '42%', axisNameGap: 8, axisName: axisName(40, 11) } } },
			{ option: { radar: { radius: '70%', axisNameGap: 10, axisName: axisName(112, 12) } } },
		],
	};
}
