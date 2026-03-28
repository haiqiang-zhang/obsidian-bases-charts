import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from 'src/ChartData';
import type { ResolvedColors } from 'src/charts/echarts-setup';
import { getResolvedColor } from 'src/charts/echarts-setup';
import { toCompactString } from 'src/utils/utils';

export function buildScatterOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
): EChartsOption {
	const dataPoints = data.getFlat(chartIndex);
	const domain = data.getYDomainForChart(chartIndex);

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const hasDate = dataPoints.some(d => d.x instanceof Date);
	const hasString = dataPoints.some(d => typeof d.x === 'string');

	const series = Array.from(seriesMap.entries()).map(([groupIdx, points]) => ({
		type: 'scatter' as const,
		name: data.getGroupName(groupIdx),
		data: points.map(p => ({
			value: [p.x instanceof Date ? p.x.getTime() : p.x, p.y],
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
		grid: { left: 10, right: 10, top: 30, bottom: 20, containLabel: true },
		xAxis: {
			type: hasDate ? 'time' : hasString ? 'category' : 'value',
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
			min: domain[0],
			max: domain[1],
		},
		tooltip: {
			trigger: 'item',
			formatter: (params: unknown) => {
				const p = params as { data: { _raw: ProcessedData } };
				const raw = p.data._raw;
				const lines: string[] = [];
				if (raw.label) lines.push(String(raw.label));
				lines.push(toCompactString(raw.y));
				return lines.join('<br/>');
			},
		},
		series,
	};
}
