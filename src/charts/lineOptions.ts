import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../ChartData';
import { ChartView, NullHandling } from '../ChartView';
import { ChartRenderer } from './ChartRenderer';
import type { ResolvedColors } from './echarts-setup';
import { getResolvedColor, GRID_OPTION } from './echarts-setup';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis-config';

export const LINE_SETTINGS = {
	NULL_HANDLING: 'null-handling',
} as const;

export function lineViewOptions(): ViewOption[] {
	const groups = ChartView.commonViewOptionGroups(false);
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
	return ChartView.buildViewOptions(groups);
}

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
	const columnName = data.getChartName(chartIndex);
	const hasDomain = data.view.hasDomainOverride();
	const domain = hasDomain ? data.getYDomainForChart(chartIndex) : undefined;

	const { xAxis, xCategories, xAxisType } = buildXAxisConfig(data, chartIndex, xName, colors);
	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => ({
		type: 'line' as const,
		name: data.getGroupName(groupIdx),
		data: xAxisType === 'category'
			? xCategories.map(cat => {
					const match = points.find(p => String(mapXValue(p, xAxisType)) === cat);
					return match ? { value: match.y, _raw: match } : { value: treatNullAsZero ? 0 : null, _raw: null };
				})
			: points.map(p => ({
					value: [mapXValue(p, xAxisType), p.y],
					_raw: p,
				})),
		itemStyle: {
			color: getResolvedColor(colors.palette, colors.accent, groupIdx, isGrouped),
		},
		lineStyle: {
			color: getResolvedColor(colors.palette, colors.accent, groupIdx, isGrouped),
		},
		connectNulls: !treatNullAsZero,
		showSymbol: true,
		symbolSize: 6,
		emphasis: {
			focus: 'series' as const,
		},
	}));

	return {
		grid: GRID_OPTION,
		xAxis,
		yAxis: buildYAxisConfig(yLabel, colors, domain),
		tooltip: isGrouped
			? {
					trigger: 'axis',
					axisPointer: { type: 'cross' },
					confine: true,
				}
			: {
					trigger: 'axis',
					enterable: true,
					hideDelay: 300,
					axisPointer: { type: 'cross' },
					confine: true,
					position: (...args: Parameters<typeof ChartRenderer.tooltipPosition>) => ChartRenderer.tooltipPosition(...args),
					formatter: (params: unknown) => {
						const result = ChartRenderer.formatAxisTooltip(
							params as { marker?: string; seriesName?: string; data: { _raw?: ProcessedData; value?: number } }[],
							columnName,
							yLabel.replace('↑ ', ''),
						);
						return result.html;
					},
				},
		series,
	};
}
