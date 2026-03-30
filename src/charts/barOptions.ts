import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../ChartData';
import { ChartView } from '../ChartView';
import { ChartRenderer } from './ChartRenderer';
import type { ResolvedColors } from './echarts-setup';
import { getResolvedColor, GRID_OPTION } from './echarts-setup';
import { toCompactString } from '../utils';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis-config';

export const BAR_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
} as const;

export function barViewOptions(): ViewOption[] {
	const groups = ChartView.commonViewOptionGroups(false);
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
	return ChartView.buildViewOptions(groups);
}

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

	const { xAxis, xCategories, xAxisType } = buildXAxisConfig(data, chartIndex, xName, colors);
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
		grid: GRID_OPTION,
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
