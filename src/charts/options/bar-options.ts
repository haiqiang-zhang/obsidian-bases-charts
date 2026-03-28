import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from 'src/ChartData';
import type { ResolvedColors } from 'src/charts/echarts-setup';
import { getResolvedColor } from 'src/charts/echarts-setup';
import { toCompactString } from 'src/utils/utils';

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
	hasUserSort: boolean,
): EChartsOption {
	const flatData = data.getFlat(chartIndex);
	const domain = hasDomainOverride ? data.getYDomainForChart(chartIndex) : undefined;

	let xCategories = [...new Set(flatData.map(d => String(d.x)))];
	if (!hasUserSort) {
		xCategories.sort((a, b) => {
			const numA = Number(a);
			const numB = Number(b);
			if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
			return a.localeCompare(b);
		});
	}

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of flatData) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => {
		const categoryData = xCategories.map(cat => {
			const match = points.find(p => String(p.x) === cat);
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
		grid: { left: 10, right: 10, top: 30, bottom: 20, containLabel: true },
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
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
		},
		series,
	};
}
