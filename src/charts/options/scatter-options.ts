import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from '../../ChartData';
import { getFileDisplayName, toCompactString } from '../../utils/utils';
import { ChartRenderer } from '../ChartRenderer';
import type { ResolvedColors } from '../echarts-setup';
import { getResolvedColor, GRID_OPTION } from '../echarts-setup';

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
		type: 'scatter' as const,
		name: isGrouped ? data.getGroupName(groupIdx) : undefined,
		data: points.map(p => ({
			value: [p.x instanceof Date ? p.x.getTime() : p.x, p.y],
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
					position: ChartRenderer.tooltipPosition,
					formatter: (params: unknown) => {
						const p = params as { data: { _raw: ProcessedData } };
						const raw = p.data._raw;
						return ChartRenderer.formatTooltip(raw, columnName, yLabel.replace('↑ ', ''));
					},
				},
		series,
	};
}
