import type { EChartsOption } from 'echarts';
import type { DataWrapper } from '../../ChartData';
import type { ResolvedColors } from '../echarts-setup';
import { toCompactString } from '../../utils/utils';

export function buildPieOption(
	data: DataWrapper,
	chartIndex: number,
	colors: ResolvedColors,
	showLabels: boolean,
	showPercentages: boolean,
	ignoreNull: boolean,
): EChartsOption {
	const rawData = data.getFlat(chartIndex);
	const flatData = ignoreNull ? rawData.filter(d => {
		const name = toCompactString(d.x);
		return name !== '' && name !== 'null' && name !== 'undefined';
	}) : rawData;

	const pieData = flatData.map((d, i) => ({
		value: d.y,
		name: toCompactString(d.x),
		_raw: d,
		itemStyle: {
			color: colors.palette[i % colors.palette.length],
		},
	}));

	return {
		tooltip: {
			trigger: 'item',
			confine: true,
			formatter: (params: unknown) => {
				const p = params as { name: string; value: number; percent: number };
				return `<div class="bases-chart-tooltip">` +
					`<div class="bases-chart-tooltip-header">${p.name}</div>` +
					`<div class="bases-chart-tooltip-value">${toCompactString(p.value)}${showPercentages ? ` (${p.percent.toFixed(1)}%)` : ''}</div>` +
					`</div>`;
			},
		},
		series: [
			{
				type: 'pie',
				radius: ['40%', '70%'],
				avoidLabelOverlap: false,
				itemStyle: {
					borderRadius: 10,
					borderColor: 'var(--background-primary)',
					borderWidth: 2,
				},
				label: showLabels
					? {
							show: true,
							formatter: showPercentages
								? '{b}: {d}%'
								: '{b}',
						}
					: {
							show: false,
							position: 'center',
						},
				emphasis: {
					label: {
						show: true,
						fontSize: 16,
						fontWeight: 'bold',
					},
				},
				labelLine: {
					show: showLabels,
				},
				data: pieData,
				cursor: 'pointer',
			},
		],
	};
}
