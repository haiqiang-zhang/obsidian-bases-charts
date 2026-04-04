import type { BasesPropertyId } from 'obsidian';
import type { ProcessedData } from './data';
import { toCompactString } from '../utils/utils';

export enum AggregateMode {
	NONE = 'None',
	AVERAGE = 'Average',
	SUM = 'Sum',
	COUNT = 'Count',
	MIN = 'Min',
	MAX = 'Max',
}

export function aggregateKey(propId: BasesPropertyId): string {
	return `aggregate:${propId}`;
}

export function aggregateData(data: ProcessedData[], modes: Map<number, AggregateMode>, chartType: string): ProcessedData[] {
	const buckets = new Map<string, ProcessedData[]>();
	for (const d of data) {
		const key = `${toCompactString(d.x)}|${d.chartIndex}|${d.groupIndex}`;
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = [];
			buckets.set(key, bucket);
		}
		bucket.push(d);
	}

	const result: ProcessedData[] = [];
	for (const bucket of buckets.values()) {
		const first = bucket[0];
		let effectiveMode = modes.get(first.chartIndex) ?? AggregateMode.NONE;

		if (effectiveMode === AggregateMode.NONE) {
			if (chartType === 'chart-scatter') {
				result.push(...bucket);
				continue;
			}
			const hasNonNumeric = bucket.some(d => !d.isNumeric);
			if (hasNonNumeric) {
				effectiveMode = AggregateMode.COUNT;
			} else if (bucket.length === 1) {
				result.push(first);
				continue;
			} else {
				effectiveMode = AggregateMode.SUM;
			}
		}

		let y: number;
		switch (effectiveMode) {
			case AggregateMode.SUM:
				y = bucket.reduce((sum, d) => sum + d.y, 0);
				break;
			case AggregateMode.AVERAGE:
				y = bucket.reduce((sum, d) => sum + d.y, 0) / bucket.length;
				break;
			case AggregateMode.COUNT:
				y = bucket.length;
				break;
			case AggregateMode.MIN:
				y = Math.min(...bucket.map(d => d.y));
				break;
			case AggregateMode.MAX:
				y = Math.max(...bucket.map(d => d.y));
				break;
			default:
				y = first.y;
		}

		result.push({
			x: first.x,
			y: y,
			isNumeric: first.isNumeric,
			groupIndex: first.groupIndex,
			chartIndex: first.chartIndex,
			files: bucket.flatMap(d => d.files),
			fileValues: bucket.flatMap(d => d.fileValues),
			label: first.label,
		});
	}

	return result;
}
