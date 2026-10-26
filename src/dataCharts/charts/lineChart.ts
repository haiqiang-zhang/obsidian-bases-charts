export const LINE_CHART_VIEW_TYPE = 'chart-line';

import type { EChartsOption } from 'echarts';
import type { BasesAllOptions } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import type { ResolvedColors } from '../../ui/colors';
import { getGroupColor, gridOption } from '../../ui/colors';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';

export enum NullHandling {
	SKIP = 'Leave gap',
	ZERO = 'Fill with 0',
}

export const LINE_SETTINGS = {
	NULL_HANDLING: 'null-handling',
} as const;

function lineViewOptions(): BasesAllOptions[] {
	const groups = DataChartView.commonViewOptionGroups();
	groups.data.push({
		displayName: 'Gap handling',
		type: 'dropdown',
		key: LINE_SETTINGS.NULL_HANDLING,
		options: {
			[NullHandling.SKIP]: NullHandling.SKIP,
			[NullHandling.ZERO]: NullHandling.ZERO,
		},
		default: NullHandling.SKIP,
	});
	return DataChartView.buildViewOptions(groups);
}

export class LineChartView extends DataChartView {
	readonly type = LINE_CHART_VIEW_TYPE;

	buildOption(data: DataWrapper, chartIndex: number, xName: string, yLabel: string, isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		const nullHandling = (this.config.get(LINE_SETTINGS.NULL_HANDLING) as NullHandling | undefined) ?? NullHandling.SKIP;
		const treatNullAsZero = nullHandling === NullHandling.ZERO;
		return buildLineOption(data, chartIndex, xName, yLabel, isGrouped, colors, treatNullAsZero);
	}
}

export const lineChartRegistration = {
	viewType: LINE_CHART_VIEW_TYPE,
	name: 'Line Chart',
	icon: 'lucide-chart-line',
	createView: LineChartView,
	viewOptions: () => lineViewOptions(),
};

export function buildLineOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
	treatNullAsZero: boolean,
): EChartsOption {
	const dataPoints = data.getFlat(chartIndex);
	const hasDomain = data.hasDomainOverride();
	const domain = hasDomain ? data.getYDomainForChart(chartIndex) : undefined;

	const { xAxis, xCategories, xAxisType, axisMedia } = buildXAxisConfig(data, chartIndex, xName, colors);
	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).sort(([a], [b]) => a - b).map(([groupIdx, points]) => {
		const pointsByCategory = new Map<string, ProcessedData>();
		for (const point of points) {
			const key = String(mapXValue(point, xAxisType));
			if (!pointsByCategory.has(key)) pointsByCategory.set(key, point);
		}
		return {
			type: 'line' as const,
			name: data.getGroupName(groupIdx),
			data: xAxisType === 'category'
				? xCategories.map(cat => {
						const match = pointsByCategory.get(cat);
						return match ? { value: match.y, _raw: match } : { value: treatNullAsZero ? 0 : null, _raw: null };
					})
				: points.map(p => ({
						value: [mapXValue(p, xAxisType), p.y],
						_raw: p,
					})),
			itemStyle: {
				color: getGroupColor(colors, groupIdx, isGrouped),
			},
			lineStyle: {
				color: getGroupColor(colors, groupIdx, isGrouped),
				width: 2,
			},
			connectNulls: data.dateTimeline ? false : !treatNullAsZero,
			showSymbol: true,
			symbolSize: 4,
			emphasis: {
				focus: 'series' as const,
			},
		};
	});

	return {
		media: axisMedia,
		grid: gridOption(),
		xAxis,
		yAxis: buildYAxisConfig(yLabel, colors, domain),
		tooltip: { trigger: 'axis', axisPointer: {
			type: 'line', axis: 'x', label: { show: false },
			lineStyle: { color: colors.grid, type: 'dashed', width: 1 },
		} },
		series,
	};
}
