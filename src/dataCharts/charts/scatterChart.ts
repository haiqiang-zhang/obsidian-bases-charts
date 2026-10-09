export const SCATTER_CHART_VIEW_TYPE = 'chart-scatter';

import type { EChartsOption } from 'echarts';
import type { BasesAllOptions } from 'obsidian';
import type { DataWrapper, ProcessedData } from '../data';
import { AggregateMode } from '../aggregate';
import { DataChartView } from '../dataChartView';
import { getFileDisplayName } from '../../utils/utils';
import type { ResolvedColors } from '../../ui/colors';
import { getResolvedColor, gridOption } from '../../ui/colors';
import { buildXAxisConfig, buildYAxisConfig, mapXValue } from '../axis';

const SCATTER_SETTINGS = {
	LABEL_PROP: 'label-property',
} as const;

function scatterViewOptions(): BasesAllOptions[] {
	const groups = DataChartView.commonViewOptionGroups();
	return DataChartView.buildViewOptions(groups);
}

export class ScatterChartView extends DataChartView {
	readonly type = SCATTER_CHART_VIEW_TYPE;

	getLabelProperty() {
		return this.config.getAsPropertyId(SCATTER_SETTINGS.LABEL_PROP);
	}

	getDefaultAggregateMode(): AggregateMode {
		return AggregateMode.NONE;
	}

	buildOption(data: DataWrapper, chartIndex: number, xName: string, yLabel: string, isGrouped: boolean, colors: ResolvedColors): EChartsOption {
		const propId = this.getYProperties()[chartIndex];
		const isNoneAggregate = propId ? this.getAggregateModeForProperty(propId) === AggregateMode.NONE : true;
		return buildScatterOption(data, chartIndex, xName, yLabel, isGrouped, colors, isNoneAggregate);
	}
}

export const scatterChartRegistration = {
	viewType: SCATTER_CHART_VIEW_TYPE,
	name: 'Scatter Chart',
	icon: 'lucide-chart-scatter',
	createView: ScatterChartView,
	viewOptions: () => scatterViewOptions(),
};

export function buildScatterOption(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	yLabel: string,
	isGrouped: boolean,
	colors: ResolvedColors,
	_isNoneAggregate: boolean,
): EChartsOption {
	const dataPoints = data.getFlat(chartIndex);
	const hasDomain = data.hasDomainOverride();
	const domain = hasDomain ? data.getYDomainForChart(chartIndex) : undefined;

	const { xAxis, xAxisType, extraBottom } = buildXAxisConfig(data, chartIndex, xName, colors);

	const seriesMap = new Map<number, ProcessedData[]>();
	for (const dp of dataPoints) {
		const arr = seriesMap.get(dp.groupIndex) ?? [];
		arr.push(dp);
		seriesMap.set(dp.groupIndex, arr);
	}

	const series = Array.from(seriesMap.entries()).sort(([a], [b]) => a - b).map(([groupIdx, points]) => ({
		type: 'scatter' as const,
		name: isGrouped ? data.getGroupName(groupIdx) : undefined,
		data: points.map(p => ({
			value: [mapXValue(p, xAxisType), p.y],
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
		grid: gridOption(extraBottom),
		xAxis,
		yAxis: buildYAxisConfig(yLabel, colors, domain),
		tooltip: { trigger: 'item', axisPointer: { type: 'cross' } },
		series,
	};
}
