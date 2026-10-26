import type { DataWrapper } from './data';
import { toXKey } from '../utils/utils';

export const BAR_LAYOUT_KEY = 'bar-layout';
export type BarLayout = 'grouped' | 'stacked' | 'percent';

export function normalizeBarLayout(value: unknown): BarLayout {
	return value === 'stacked' || value === 'percent' ? value : 'grouped';
}

/** A zero-total column has no contribution; never turn it into NaN or 100%. */
export function stackPercentage(value: number, total: number): number {
	return total > 0 ? value / total * 100 : 0;
}

/** Match ECharts' same-sign stacks, including a zero baseline. */
export function getStackedDomain(data: DataWrapper, chartIndex: number): [number, number] {
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
