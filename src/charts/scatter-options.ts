import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../ChartData';
import { ChartView } from '../ChartView';
import { getFileDisplayName } from '../utils';
import { ChartRenderer } from './ChartRenderer';
import type { ResolvedColors } from './echarts-setup';
import { getResolvedColor, GRID_OPTION } from './echarts-setup';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis-config';

export const SCATTER_SETTINGS = {
	LABEL_PROP: 'label-property',
} as const;

export function scatterViewOptions(): ViewOption[] {
	return [
		...ChartView.commonViewOptions(),
		ChartView.aggregateOption(true),
		{
			displayName: 'Label property',
			type: 'property',
			key: SCATTER_SETTINGS.LABEL_PROP,
			placeholder: 'Property',
		},
	];
}

export function buildScatterOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
	isNoneAggregate: boolean,
): EChartsOption {
	const dataPoints = data.getFlat(chartIndex);
	const columnName = data.getChartName(chartIndex);
	const hasDomain = data.view.hasDomainOverride();
	const domain = hasDomain ? data.getYDomainForChart(chartIndex) : undefined;

	const { xAxis, xAxisType } = buildXAxisConfig(data, chartIndex, xName, colors);

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => ({
		type: 'scatter' as const,
		name: isGrouped ? data.getGroupName(groupIdx) : undefined,
		data: points.map(p => ({
			value: [mapXValue(p, xAxisType), p.y],
			name: p.files.length > 0 ? getFileDisplayName(p.files[0]) : undefined,
			_raw: p,
		})),
		itemStyle: {
			color: getResolvedColor(colors.palette, colors.accent, groupIdx, isGrouped),
		},
		emphasis: {
			itemStyle: { borderColor: colors.text, borderWidth: 2 },
		},
	}));

	return {
		grid: GRID_OPTION,
		xAxis,
		yAxis: buildYAxisConfig(yLabel, colors, domain),
		tooltip: isNoneAggregate
			? {
					trigger: 'item' as const,
					confine: true,
					axisPointer: { type: 'cross' as const },
				}
			: {
					trigger: 'item' as const,
					enterable: true,
					hideDelay: 300,
					confine: true,
					position: (...args: Parameters<typeof ChartRenderer.tooltipPosition>) => ChartRenderer.tooltipPosition(...args),
					formatter: (params: unknown) => {
						const p = params as { data: { _raw: ProcessedData } };
						const raw = p.data._raw;
						return ChartRenderer.formatTooltip(raw, columnName, yLabel.replace('↑ ', ''));
					},
				},
		series,
	};
}
