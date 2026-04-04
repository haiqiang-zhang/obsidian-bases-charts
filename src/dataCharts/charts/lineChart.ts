export const LINE_CHART_VIEW_TYPE = 'chart-line';

import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import { ChartRenderer } from '../../utils/renderer';
import type { ResolvedColors } from '../../ui/colors';
import { getResolvedColor, GRID_OPTION } from '../../ui/colors';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';

export enum NullHandling {
	SKIP = 'Leave gap',
	ZERO = 'Fill with 0',
}

export const LINE_SETTINGS = {
	NULL_HANDLING: 'null-handling',
} as const;

function lineViewOptions(): ViewOption[] {
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
	const columnName = data.getChartName(chartIndex);
	const hasDomain = data.hasDomainOverride();
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
