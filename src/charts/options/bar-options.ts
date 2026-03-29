import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from '../../ChartData';
import { ChartRenderer } from '../ChartRenderer';
import type { ResolvedColors } from '../echarts-setup';
import { getResolvedColor, GRID_OPTION } from '../echarts-setup';
import { toCompactString } from '../../utils/utils';

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

	// Use pre-sorted x order from Bases (ungrouped, respects user sort settings)
	const flatXSet = new Set(flatData.map(d => toCompactString(d.x)));
	const xCategories = data.sortedXOrder.filter(x => flatXSet.has(x));

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of flatData) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => {
		const categoryData = xCategories.map(cat => {
			const match = points.find(p => toCompactString(p.x) === cat);
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
		xAxis: {
			type: 'category',
			data: xCategories,
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
			axisLabel: {
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
