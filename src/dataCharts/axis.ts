import type { EChartsOption, XAXisComponentOption, YAXisComponentOption } from 'echarts';
import type { DataWrapper, ProcessedData } from './data';
import type { ResolvedColors } from '../ui/colors';
import type { XAxisType } from '../utils/utils';
import { toXKey } from '../utils/utils';

/**
 * Build the shared xAxis ECharts config from the DataWrapper.
 * All chart types that need an x axis should use this.
 */
export function buildXAxisConfig(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	colors: ResolvedColors,
	xAxisType: XAxisType = data.xAxisType,
): {
	xAxis: XAXisComponentOption;
	xCategories: string[];
	xAxisType: XAxisType;
	axisMedia: EChartsOption['media'];
} {
	const flatData = data.getFlat(chartIndex);
	const flatXSet = new Set(flatData.map(d => toXKey(d.x)));
	// An explicit calendar timeline also contains periods with no Y samples.
	// Keep those positions without adding synthetic observations to the data.
	const xCategories = data.dateTimeline?.categories ?? data.sortedXOrder.filter(x => flatXSet.has(x));
	const labelColor = colors.mutedText ?? colors.text;

	const xAxis: XAXisComponentOption = {
		type: xAxisType,
		name: xName,
		nameLocation: 'middle',
		nameGap: 32,
		nameTruncate: { maxWidth: 180, ellipsis: '…' },
		nameTextStyle: { color: labelColor, fontSize: 12 },
		axisLabel: { color: labelColor, hideOverlap: true, fontSize: 12 },
		axisLine: { lineStyle: { color: colors.grid } },
		axisTick: { show: false },
		splitLine: { show: false },
	};

	if (xAxis.type === 'category') {
		xAxis.data = xCategories;
		xAxis.boundaryGap = true;
		const crowded = xCategories.length > 10;
		const labelWidth = crowded ? 80 : 110;
		const rotation = crowded ? 35 : 0;
		const step = Math.max(1, Math.ceil(xCategories.length / 20));
		xAxis.axisLabel = {
			...xAxis.axisLabel,
			// Bar charts use categorical positions even for timestamps. Format only
			// the visible label; keep the full timestamp as the category identity.
			formatter: data.xAxisType === 'time' ? value => new Date(value).toLocaleString() : undefined,
			overflow: 'truncate',
			width: labelWidth,
			rotate: rotation,
			// Auto interval measures the full original text before truncation.
			// Bound the candidates, then let hideOverlap fit the visible labels.
			interval: (index: number) => index === 0 || index === xCategories.length - 1 || index % step === 0,
		};
		xAxis.nameGap = crowded ? Math.ceil(labelWidth * Math.sin(rotation * Math.PI / 180)) + 22 : 36;
	}

	return { xAxis, xCategories, xAxisType, axisMedia: categoryAxisMedia(xAxis, xCategories) };
}

/** Keep modest category sets readable in narrow views without shrinking text. */
function categoryAxisMedia(xAxis: XAXisComponentOption, categories: string[]): EChartsOption['media'] {
	const categoryCount = categories.length;
	// Long paths need the existing wider, sampled labels to retain distinct
	// prefixes. Wrapping each into a tiny band would make them indistinguishable.
	if (xAxis.type !== 'category' || categoryCount < 2 || categoryCount > 8 || categories.some(value => value.length > 24)) return [];
	const compactAxis = (availableWidth: number): XAXisComponentOption => ({
		nameGap: 48,
		axisLabel: {
			...xAxis.axisLabel,
			width: Math.min(110, Math.max(24, Math.floor(availableWidth / categoryCount) - 4)),
			overflow: 'break',
			lineOverflow: 'truncate',
			height: 28,
			lineHeight: 14,
		},
	});
	return [
		{ query: { maxWidth: 519 }, option: { xAxis: compactAxis(296) } },
		{ query: { maxWidth: 359 }, option: { xAxis: compactAxis(216) } },
		{
			// Explicitly clear wrapping dimensions when the view widens again.
			option: { xAxis: {
				nameGap: xAxis.nameGap,
				axisLabel: { ...xAxis.axisLabel, height: undefined, lineHeight: undefined, lineOverflow: undefined },
			} },
		},
	];
}

/**
 * Build the shared yAxis ECharts config.
 */
export function buildYAxisConfig(
	yLabel: string,
	colors: ResolvedColors,
	domain?: [number, number],
): YAXisComponentOption & { type: 'value' } {
	const labelColor = colors.mutedText ?? colors.text;
	return {
		type: 'value',
		name: yLabel,
		nameLocation: 'end',
		nameGap: 18,
		nameTruncate: { maxWidth: 180, ellipsis: '…' },
		nameTextStyle: { align: 'left', color: labelColor, fontSize: 12 },
		axisLabel: { color: labelColor, fontSize: 12 },
		axisLine: { show: false },
		axisTick: { show: false },
		splitNumber: 4,
		boundaryGap: ['0%', '10%'],
		splitLine: { lineStyle: { color: colors.grid, type: 'dotted', opacity: 0.7 } },
		min: domain ? domain[0] : undefined,
		max: domain ? domain[1] : undefined,
	};
}

/**
 * Map a data point's x value to the format expected by ECharts series data.
 *   category → lossless category identity (labels are formatted separately)
 *   time     → timestamp
 *   value    → raw number
 */
export function mapXValue(point: ProcessedData, xAxisType: XAxisType): number | string {
	if (xAxisType === 'category') {
		return toXKey(point.x);
	}
	return point.x instanceof Date ? point.x.getTime() : point.x;
}
