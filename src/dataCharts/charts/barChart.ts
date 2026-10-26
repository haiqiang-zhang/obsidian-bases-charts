export const BAR_CHART_VIEW_TYPE = 'chart-bar';

import type { BarSeriesOption, EChartsOption } from 'echarts';
import type { BasesAllOptions, BasesViewConfig } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import type { ResolvedColors } from '../../ui/colors';
import { getResolvedColor, gridOption } from '../../ui/colors';
import { toCompactString } from '../../utils/utils';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';
import { BAR_LAYOUT_KEY, getStackedDomain, normalizeBarLayout, stackPercentage } from '../stacking';
import type { BarLayout } from '../stacking';

export const BAR_SETTINGS = {
	SHOW_LABELS: 'show-labels',
	SHOW_PERCENTAGES: 'show-percentages',
} as const;

function barViewOptions(config?: BasesViewConfig): BasesAllOptions[] {
	const groups = DataChartView.commonViewOptionGroups();
	const isPercent = () => normalizeBarLayout(config?.get(BAR_LAYOUT_KEY)) === 'percent';
	groups.data.push(
		{
			displayName: 'Bar layout',
			type: 'dropdown',
			key: BAR_LAYOUT_KEY,
			default: 'grouped',
			options: { grouped: 'Grouped', stacked: 'Stacked', percent: '100% Stacked' },
		},
		{
			displayName: 'Show labels',
			type: 'toggle',
			key: BAR_SETTINGS.SHOW_LABELS,
			default: true,
		},
		{
			displayName: 'Format values as percentages',
			type: 'toggle',
			key: BAR_SETTINGS.SHOW_PERCENTAGES,
			default: false,
			shouldHide: isPercent,
		},
	);
	return DataChartView.buildViewOptions(groups).map(option => option.type === 'group'
		? { ...option, shouldHide: isPercent } : option);
}

export class BarChartView extends DataChartView {
	readonly type = BAR_CHART_VIEW_TYPE;

	processData(): DataWrapper {
		const data = super.processData();
		if (normalizeBarLayout(this.config.get(BAR_LAYOUT_KEY)) !== 'grouped') {
			// Sync stacked totals, not the largest individual group value.
			Object.assign(data.yDomain, this.getYDomainOverrides());
		}
		return data;
	}

	getChartMessage(data: DataWrapper, chartIndex: number): string | null {
		if (data.dateTimeline?.error) return data.dateTimeline.error;
		return normalizeBarLayout(this.config.get(BAR_LAYOUT_KEY)) === 'percent'
			&& data.getFlat(chartIndex).some(point => point.y < 0)
			? '100% Stacked requires non-negative values. Choose Stacked to compare positive and negative values.' : null;
	}

	buildOption(data: DataWrapper, chartIndex: number, xName: string, yLabel: string, isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		const showLabels = Boolean(this.config.get(BAR_SETTINGS.SHOW_LABELS) ?? true);
		const showPercentages = Boolean(this.config.get(BAR_SETTINGS.SHOW_PERCENTAGES) ?? false);
		return buildBarOption(data, chartIndex, xName, yLabel, isGrouped, colors, showLabels, showPercentages,
			data.hasDomainOverride(), normalizeBarLayout(this.config.get(BAR_LAYOUT_KEY)));
	}
}

export const barChartRegistration = {
	viewType: BAR_CHART_VIEW_TYPE,
	name: 'Bar Chart',
	icon: 'lucide-chart-column',
	createView: BarChartView,
	viewOptions: barViewOptions,
};

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
	layout: BarLayout = 'grouped',
): EChartsOption {
	const flatData = data.getFlat(chartIndex);
	const stacked = layout !== 'grouped';
	const percent = layout === 'percent';
	const domain: [number, number] | undefined = percent ? [0, 100] : hasDomainOverride
		? stacked ? getStackedDomain(data, chartIndex) : data.getYDomainForChart(chartIndex) : undefined;

	// Bar always uses category axis regardless of detected type
	const { xAxis, xCategories, xAxisType, axisMedia } = buildXAxisConfig(data, chartIndex, xName, colors, 'category');

	const seriesMap = new Map<number, Map<string, ProcessedData>>();
	const totals = new Map<string, number>();
	for (const dp of flatData) {
		const key = String(mapXValue(dp, xAxisType));
		const arr = seriesMap.get(dp.groupIndex) ?? new Map<string, ProcessedData>();
		arr.set(key, dp);
		seriesMap.set(dp.groupIndex, arr);
		totals.set(key, (totals.get(key) ?? 0) + dp.y);
	}

	const edges = xCategories.map(() => ({ positive: 0, negative: 0, previous: 0 }));
	const series = Array.from(seriesMap.entries()).sort(([a], [b]) => a - b).map(([groupIdx, points]) => {
		const categoryData = xCategories.map((cat, index) => {
			const match = points.get(cat);
			const value = percent ? stackPercentage(match?.y ?? 0, totals.get(cat) ?? 0) : match?.y ?? 0;
			const edge = edges[index];
			const sign = value < 0 ? 'negative' : 'positive';
			edge[sign] += value;
			const stackY = value === 0 ? edge.previous : edge[sign];
			if (stackY !== 0) edge.previous = stackY;
			return { value: data.dateTimeline && !match ? null : value, _raw: match ?? null,
				...(stacked ? { _stackY: stackY } : {}) };
		});

		const config: BarSeriesOption = {
			type: 'bar',
			...(stacked ? { stack: 'bar-total', stackStrategy: 'samesign' as const } : {}),
			name: data.getGroupName(groupIdx),
			data: categoryData,
			barMaxWidth: stacked ? 48 : 22,
			barCategoryGap: '50%',
			barGap: '30%',
			labelLayout: stacked ? params => {
				const fits = params.labelRect.width <= Math.abs(params.rect.width) - 6
					&& params.labelRect.height <= Math.abs(params.rect.height) - 4;
				// Hide the entire label if it cannot fit inside its segment.
				return { hideOverlap: true, width: fits ? undefined : 0, height: fits ? undefined : 0 };
			} : { hideOverlap: true },
			itemStyle: {
				color: getResolvedColor(colors.palette, colors.accent, groupIdx, isGrouped),
			},
			emphasis: {
				focus: 'series',
			},
			cursor: 'pointer',
		};

		if (showLabels) {
			config.label = {
				show: true,
				position: stacked ? 'inside' : 'top',
				...(stacked ? { overflow: 'truncate' as const, ellipsis: '', lineOverflow: 'truncate' as const }
					: { color: colors.mutedText ?? colors.text }),
				formatter: (params: { value: unknown }) => {
					if (params.value == null) return '';
					const val = params.value as number;
					if (stacked && val === 0) return '';
					return percent || showPercentages ? `${val.toFixed(1)}%` : toCompactString(val);
				},
			};
		}

		return config;
	});

	return {
		media: axisMedia,
		grid: gridOption(),
		xAxis,
		yAxis: {
			...buildYAxisConfig(percent ? `${yLabel} · Share` : yLabel, colors, domain),
			...(percent ? { interval: 25 } : {}),
			axisLabel: {
				color: colors.mutedText ?? colors.text,
				formatter: percent || showPercentages ? ('{value}%') : ((v: number) => toCompactString(v)),
			},
		},
		tooltip: { trigger: 'axis', axisPointer: {
			type: 'line', axis: 'x', label: { show: false },
			lineStyle: { color: colors.grid, type: 'dashed', width: 1 },
		} },
		series,
	};
}
