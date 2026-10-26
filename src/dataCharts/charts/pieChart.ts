export const PIE_CHART_VIEW_TYPE = 'chart-pie';

import type { EChartsOption } from 'echarts';
import type { BasesAllOptions } from 'obsidian';
import type { DataWrapper } from '../data';
import { DataChartView } from '../dataChartView';
import type { ResolvedColors } from '../../ui/colors';
import { getGroupColor } from '../../ui/colors';
import { mapXValue } from '../axis';

export const PIE_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
	IGNORE_NULL: 'ignore-null',
} as const;

function pieViewOptions(): BasesAllOptions[] {
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
	// Pie values do not use a Cartesian Y scale.
	return groups.data;
}

export class PieChartView extends DataChartView {
	readonly type = PIE_CHART_VIEW_TYPE;

	protected onChartLoad(): void {
		this.containerEl.addClass('bases-pie-chart-view');
		super.onChartLoad();
	}

	protected onChartUnload(): void {
		super.onChartUnload();
		this.containerEl.removeClass('bases-pie-chart-view');
	}

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
	const isGrouped = data.isGrouped;
	// Group indices follow Bases' configured order. Keep each group's slices
	// together, without mutating the shared data cache or changing the X order.
	const orderedData = isGrouped
		? [...flatData].sort((a, b) => a.groupIndex - b.groupIndex)
		: flatData;

	const pieData = orderedData.map((d, i) => ({
		value: d.y,
		name: isGrouped
			? `${data.getGroupName(d.groupIndex)} · ${String(mapXValue(d, xAxisType))}`
			: String(mapXValue(d, xAxisType)),
		_raw: d,
		itemStyle: {
			color: getGroupColor(colors, d.groupIndex, isGrouped, isGrouped ? d.groupIndex : i),
		},
	}));
	const labelFormatter = showPercentages ? '{b}: {d}%' : '{b}';

	return {
		tooltip: { trigger: 'item' },
		series: [
			{
				type: 'pie',
				center: ['50%', '50%'],
				radius: ['44%', '76%'],
				avoidLabelOverlap: true,
				itemStyle: {
					borderRadius: 10,
					borderColor: colors.background,
					borderWidth: 2,
				},
				label: showLabels
					? {
							show: true,
							color: colors.text,
							bleedMargin: 8,
							overflow: 'truncate',
							formatter: labelFormatter,
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
					length: 15,
					length2: 15,
					lineStyle: { color: colors.grid },
				},
				labelLayout: {
					hideOverlap: true,
				},
				data: pieData,
				cursor: 'pointer',
			},
		],
		// Leave room for outside labels in a narrow split. The default media
		// option restores the larger ring when the same view grows again.
		media: showLabels ? [
			{
				query: { maxWidth: 519 },
				option: { series: [{
					radius: ['36%', '62%'],
					label: {
						formatter: showPercentages ? '{b}\n{d}%' : '{b}',
						width: 88, lineHeight: 16,
						alignTo: 'edge', edgeDistance: 8, distanceToLabelLine: 4,
					},
					labelLine: { length: 6, length2: 6 },
				}] },
			},
			{
				query: { maxWidth: 279 },
				option: { series: [{ radius: ['30%', '52%'], label: { width: 60, edgeDistance: 6 }, labelLine: { length: 4, length2: 4 } }] },
			},
			{
				option: { series: [{
					radius: ['44%', '76%'],
					label: { formatter: labelFormatter, width: undefined, lineHeight: undefined, alignTo: 'none', edgeDistance: '25%', distanceToLabelLine: 5 },
					labelLine: { length: 15, length2: 15 },
				}] },
			},
		] : [],
	};
}
