import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper } from '../ChartData';
import { ChartView } from '../ChartView';
import type { ResolvedColors } from './echarts-setup';
import { toCompactString } from '../utils';
import { mapXValue } from '../axis-config';

export const PIE_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
	IGNORE_NULL: 'ignore-null',
} as const;

export function pieViewOptions(): ViewOption[] {
	return [
		...ChartView.commonViewOptions(),
		ChartView.aggregateOption(false),
		{
			displayName: 'Show labels',
			type: 'toggle',
			key: PIE_SETTINGS.SHOW_LABELS,
			default: true,
		},
		{
			displayName: 'Show as percentages',
			type: 'toggle',
			key: PIE_SETTINGS.SHOW_PERCENTAGES,
			default: false,
		},
		{
			displayName: 'Ignore null',
			type: 'toggle',
			key: PIE_SETTINGS.IGNORE_NULL,
			default: true,
		},
	];
}

export function buildPieOption(
	data: DataWrapper,
	chartIndex: number,
	colors: ResolvedColors,
	showLabels: boolean,
	showPercentages: boolean,
	ignoreNull: boolean,
): EChartsOption {
	const rawData = data.getFlat(chartIndex);
	const xAxisType = data.xAxisType;
	const flatData = ignoreNull ? rawData.filter(d => {
		const name = String(mapXValue(d, xAxisType));
		return name !== '' && name !== 'null' && name !== 'undefined';
	}) : rawData;

	const pieData = flatData.map((d, i) => ({
		value: d.y,
		name: String(mapXValue(d, xAxisType)),
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
					borderColor: colors.background,
					borderWidth: 2,
				},
				label: showLabels
					? {
							show: true,
							color: colors.text,
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
						color: colors.text,
					},
				},
				labelLine: {
					show: showLabels,
					lineStyle: { color: colors.grid },
				},
				labelLayout: {
					hideOverlap: true,
				},
				data: pieData,
				cursor: 'pointer',
			},
		],
	};
}
