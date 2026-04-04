export const BAR_CHART_VIEW_TYPE = 'chart-bar';

import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import { ChartRenderer } from '../../utils/renderer';
import type { ResolvedColors } from '../../ui/colors';
import { getResolvedColor, gridOption } from '../../ui/colors';
import { toCompactString } from '../../utils/utils';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';

export const BAR_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
} as const;

function barViewOptions(): ViewOption[] {
	const groups = DataChartView.commonViewOptionGroups();
	groups.data.push(
		{
			displayName: 'Show labels',
			type: 'toggle',
			key: BAR_SETTINGS.SHOW_LABELS,
			default: true,
		},
		{
			displayName: 'Show as percentages',
			type: 'toggle',
			key: BAR_SETTINGS.SHOW_PERCENTAGES,
			default: false,
		},
	);
	return DataChartView.buildViewOptions(groups);
}

export class BarChartView extends DataChartView {
	readonly type = BAR_CHART_VIEW_TYPE;

	buildOption(data: DataWrapper, chartIndex: number, xName: string, yLabel: string, isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		const showLabels = Boolean(this.config.get(BAR_SETTINGS.SHOW_LABELS) ?? true);
		const showPercentages = Boolean(this.config.get(BAR_SETTINGS.SHOW_PERCENTAGES) ?? false);
		return buildBarOption(data, chartIndex, xName, yLabel, isGrouped, colors, showLabels, showPercentages, data.hasDomainOverride());
	}
}

export const barChartRegistration = {
	viewType: BAR_CHART_VIEW_TYPE,
	name: 'Bar Chart',
	icon: 'lucide-chart-column',
	createView: BarChartView,
	viewOptions: () => barViewOptions(),
};

export function buildBarOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
	showLabels: boolean,
	showPercentages: boolean,
	hasDomainOverride: boolean,
): EChartsOption {
	const flatData = data.getFlat(chartIndex);
	const domain = hasDomainOverride ? data.getYDomainForChart(chartIndex) : undefined;
	const columnName = data.getChartName(chartIndex);

	const { xAxis, xCategories, xAxisType, extraBottom } = buildXAxisConfig(data, chartIndex, xName, colors);
	// Bar always uses category axis regardless of detected type
	xAxis.type = 'category';
	xAxis.data = xCategories;

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of flatData) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => {
		const categoryData = xCategories.map(cat => {
			const match = points.find(p => String(mapXValue(p, xAxisType)) === cat);
			return match ? { value: match.y, _raw: match } : { value: 0, _raw: null };
		});

		const config: Record<string, unknown> = {
			type: 'bar',
			name: data.getGroupName(groupIdx),
			data: categoryData,
			barMaxWidth: 80,
			itemStyle: {
				color: getResolvedColor(colors.palette, colors.accent, groupIdx, isGrouped),
			},
			emphasis: {
				focus: 'series',
			},
			cursor: 'pointer',
		};

		if (showLabels) {
			config['label'] = {
				show: true,
				position: 'top',
				formatter: (params: { value: unknown }) => {
					const val = params.value as number;
					return showPercentages ? `${val.toFixed(1)}%` : toCompactString(val);
				},
			};
		}

		return config;
	});

	return {
		grid: gridOption(extraBottom),
		xAxis,
		yAxis: {
			...buildYAxisConfig(yLabel, colors, domain),
			axisLabel: {
				color: colors.text,
				formatter: showPercentages ? ('{value}%' as string) : ((v: number) => toCompactString(v)),
			},
		},
		tooltip: isGrouped
			? {
					trigger: 'axis',
					axisPointer: { type: 'shadow' },
					confine: true,
				}
			: {
					trigger: 'axis',
					enterable: true,
					hideDelay: 300,
					axisPointer: { type: 'shadow' },
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
