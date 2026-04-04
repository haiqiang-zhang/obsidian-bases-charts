export const PIE_CHART_VIEW_TYPE = 'chart-pie';

import type { EChartsOption } from 'echarts';
import type { ViewOption } from 'obsidian';
import type { DataWrapper } from '../data';
import { DataChartView } from '../dataChartView';
import type { ResolvedColors } from '../../ui/colors';
import { toCompactString } from '../../utils/utils';
import { mapXValue } from '../axis';

export const PIE_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
	IGNORE_NULL: 'ignore-null',
} as const;

function pieViewOptions(): ViewOption[] {
	const groups = DataChartView.commonViewOptionGroups();
	groups.data.push(
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
	);
	return DataChartView.buildViewOptions(groups);
}

export class PieChartView extends DataChartView {
	readonly type = PIE_CHART_VIEW_TYPE;

	buildOption(data: DataWrapper, chartIndex: number, _xName: string, _yLabel: string, _isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		const showLabels = Boolean(this.config.get(PIE_SETTINGS.SHOW_LABELS) ?? true);
		const showPercentages = Boolean(this.config.get(PIE_SETTINGS.SHOW_PERCENTAGES) ?? false);
		const ignoreNull = Boolean(this.config.get(PIE_SETTINGS.IGNORE_NULL) ?? true);
		return buildPieOption(data, chartIndex, colors, showLabels, showPercentages, ignoreNull);
	}
}

export const pieChartRegistration = {
	viewType: PIE_CHART_VIEW_TYPE,
	name: 'Pie Chart',
	icon: 'lucide-chart-pie',
	createView: PieChartView,
	viewOptions: () => pieViewOptions(),
};

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
