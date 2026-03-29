import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from '../../ChartData';
import { ChartRenderer } from '../ChartRenderer';
import type { ResolvedColors } from '../echarts-setup';
import { getResolvedColor, GRID_OPTION } from '../echarts-setup';
import { toCompactString } from '../../utils/utils';

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

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const hasDate = dataPoints.some(d => d.x instanceof Date);
	const hasString = dataPoints.some(d => typeof d.x === 'string');

	const flatXSet = new Set(dataPoints.map(d => toCompactString(d.x)));
	const xCategories = data.sortedXOrder.filter(x => flatXSet.has(x));

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => ({
		type: 'line' as const,
		name: data.getGroupName(groupIdx),
		data: hasString
			? xCategories.map(cat => {
					const match = points.find(p => toCompactString(p.x) === cat);
					return match ? { value: match.y, _raw: match } : { value: treatNullAsZero ? 0 : null, _raw: null };
				})
			: points.map(p => ({
					value: [p.x instanceof Date ? p.x.getTime() : p.x, p.y],
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
		xAxis: {
			type: hasDate ? 'time' : hasString ? 'category' : 'value',
			data: hasString ? xCategories : undefined,
			name: xName,
			nameLocation: 'middle',
			nameGap: 25,
		},
		yAxis: {
			type: 'value',
			name: yLabel,
			nameLocation: 'end',
			nameGap: 15,
			nameTextStyle: { align: 'left' },
			min: domain ? domain[0] : undefined,
			max: domain ? domain[1] : undefined,
		},
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
					position: ChartRenderer.tooltipPosition,
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
