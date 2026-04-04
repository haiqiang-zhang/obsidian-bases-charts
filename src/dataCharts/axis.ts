import type { DataWrapper, ProcessedData } from './data';
import type { ResolvedColors } from '../ui/colors';
import type { XAxisType } from '../utils/utils';
import { toCompactString } from '../utils/utils';

/**
 * Build the shared xAxis ECharts config from the DataWrapper.
 * All chart types that need an x axis should use this.
 */
export function buildXAxisConfig(
	data: DataWrapper,
	chartIndex: number,
	xName: string,
	colors: ResolvedColors,
): {
	xAxis: Record<string, unknown>;
	xCategories: string[];
	xAxisType: XAxisType;
} {
	const xAxisType = data.xAxisType;

	const flatData = data.getFlat(chartIndex);
	const flatXSet = new Set(flatData.map(d => toCompactString(d.x)));
	const xCategories = data.sortedXOrder.filter(x => flatXSet.has(x));

	const xAxis: Record<string, unknown> = {
		type: xAxisType,
		name: xName,
		nameLocation: 'middle',
		nameGap: 25,
		nameTextStyle: { color: colors.text },
		axisLabel: { color: colors.text },
		axisLine: { lineStyle: { color: colors.grid } },
		splitLine: { lineStyle: { color: colors.grid } },
	};

	if (xAxisType === 'category') {
		xAxis.data = xCategories;
		xAxis.axisLabel = {
			...xAxis.axisLabel as Record<string, unknown>,
			interval: 0,
			overflow: 'truncate',
			width: 80
		};
	}

	return { xAxis, xCategories, xAxisType };
}

/**
 * Build the shared yAxis ECharts config.
 */
export function buildYAxisConfig(
	yLabel: string,
	colors: ResolvedColors,
	domain?: [number, number],
): Record<string, unknown> {
	return {
		type: 'value',
		name: yLabel,
		nameLocation: 'end',
		nameGap: 15,
		nameTextStyle: { align: 'left', color: colors.text },
		axisLabel: { color: colors.text },
		axisLine: { lineStyle: { color: colors.grid } },
		splitLine: { lineStyle: { color: colors.grid } },
		min: domain ? domain[0] : undefined,
		max: domain ? domain[1] : undefined,
	};
}

/**
 * Map a data point's x value to the format expected by ECharts series data.
 *   category → display string
 *   time     → timestamp
 *   value    → raw number
 */
export function mapXValue(point: ProcessedData, xAxisType: XAxisType): number | string {
	if (xAxisType === 'category') {
		return toCompactString(point.x);
	}
	return point.x instanceof Date ? point.x.getTime() : (point.x as number);
}
