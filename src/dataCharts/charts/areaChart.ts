export const AREA_CHART_VIEW_TYPE = 'chart-area';

import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData } from '../data';
import { DataChartView } from '../dataChartView';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';
import { toXKey } from '../../utils/utils';
import type { ResolvedColors } from '../../ui/colors';
import { getResolvedColor, gridOption } from '../../ui/colors';

export class AreaChartView extends DataChartView {
	readonly type = AREA_CHART_VIEW_TYPE;

	processData(): DataWrapper {
		const data = super.processData();
		// The shared pipeline fills synced bounds from individual values. A
		// stacked chart instead needs the cumulative positive/negative totals.
		Object.assign(data.yDomain, this.getYDomainOverrides());
		return data;
	}

	buildOption(data: DataWrapper, chartIndex: number, xName: string, yLabel: string, isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		return buildAreaOption(data, chartIndex, xName, yLabel, isGrouped, colors);
	}
}

export const areaChartRegistration = {
	viewType: AREA_CHART_VIEW_TYPE,
	name: 'Stacked Area Chart',
	icon: 'lucide-chart-area',
	createView: AreaChartView,
	viewOptions: () => DataChartView.buildViewOptions(DataChartView.commonViewOptionGroups()),
};

/** Match ECharts' same-sign stacks, including a zero baseline for area fills. */
export function getStackedAreaDomain(data: DataWrapper, chartIndex: number): [number, number] {
	const indices = data.yDomain.synced ? data.getChartIdentifiers().map((_, index) => index) : [chartIndex];
	let min = 0;
	let max = 0;
	for (const index of indices) {
		const totals = new Map<string, [number, number]>();
		for (const point of data.getFlat(index)) {
			const key = toXKey(point.x);
			const total = totals.get(key) ?? [0, 0];
			total[point.y < 0 ? 0 : 1] += point.y;
			totals.set(key, total);
		}
		for (const [negative, positive] of totals.values()) {
			min = Math.min(min, negative);
			max = Math.max(max, positive);
		}
	}
	return [data.yDomain.min ?? min, data.yDomain.max ?? max];
}

export function buildAreaOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
): EChartsOption {
	const points = data.getFlat(chartIndex);
	const { xAxis, xCategories, xAxisType, axisMedia } = buildXAxisConfig(data, chartIndex, xName, colors);
	const groups = new Map<number, Map<string, ProcessedData>>();
	const values = new Map<string, number | string>();
	for (const point of points) {
		const key = toXKey(point.x);
		values.set(key, mapXValue(point, xAxisType));
		const group = groups.get(point.groupIndex) ?? new Map<string, ProcessedData>();
		group.set(key, point);
		groups.set(point.groupIndex, group);
	}
	// ECharts aligns continuous-axis stacks by data index. Every group must
	// therefore contain exactly the same sorted X positions, including gaps.
	const keys = xAxisType === 'category'
		? xCategories
		: [...values.keys()].sort((a, b) => Number(values.get(a)) - Number(values.get(b)));
	if (xAxisType === 'category') xAxis.boundaryGap = false;
	const stackTotals = new Map<string, [number, number]>();
	const previousStack = new Map<string, number>();
	const series = [...groups.entries()].sort(([a], [b]) => a - b).map(([groupIndex, group]) => {
		const color = getResolvedColor(colors.palette, colors.accent, groupIndex, isGrouped);
		return {
			type: 'line' as const,
			name: data.getGroupName(groupIndex),
			stack: 'area-total',
			stackStrategy: 'samesign' as const,
			data: keys.map(key => {
				const point = group.get(key);
				const y = point?.y ?? 0;
				const totals = stackTotals.get(key) ?? [0, 0];
				const sign = y < 0 ? 0 : 1;
				totals[sign] += y;
				stackTotals.set(key, totals);
				// ECharts places a zero on the closest preceding nonzero stack,
				// regardless of sign. Keep tooltip anchors on that same edge.
				const stackY = y === 0 ? previousStack.get(key) ?? 0 : totals[sign];
				if (stackY !== 0) previousStack.set(key, stackY);
				return { value: xAxisType === 'category' ? y : [values.get(key)!, y], _raw: point ?? null, _stackY: stackY };
			}),
			itemStyle: { color },
			lineStyle: { color, width: 2 },
			areaStyle: { color, opacity: 0.55 },
			showSymbol: keys.length <= 32,
			symbol: 'circle',
			symbolSize: 4,
			connectNulls: false,
			emphasis: { focus: 'series' as const },
		};
	});
	return {
		media: axisMedia,
		grid: gridOption(),
		xAxis,
		yAxis: buildYAxisConfig(yLabel, colors, data.hasDomainOverride() ? getStackedAreaDomain(data, chartIndex) : undefined),
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'line', axis: 'x', label: { show: false }, lineStyle: { color: colors.grid, type: 'dashed', width: 1 } },
		},
		series,
	};
}
