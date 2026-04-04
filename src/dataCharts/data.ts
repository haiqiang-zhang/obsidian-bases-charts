import type { BasesPropertyId } from 'obsidian';
import type { ChartView, YDomainOverrides } from './chartView';
import type { XAxisType } from './utils';
import { OBSIDIAN_COLOR_PALETTE, toCompactString } from './utils';

export type ProcessedData = {
	x: number | Date | string;
	y: number;
	/** Index into the group-by set; used for coloring. */
	groupIndex: number;
	/** Index into the Y-axis property list; each value produces a separate chart. */
	chartIndex: number;
	isNumeric: boolean;
	files: string[];
	fileValues: number[];
	label?: string;
};

export abstract class AbstractDataWrapper<ChartId, GroupId> {
	readonly view: ChartView;
	readonly data: ProcessedData[];
	readonly groupBySet: string[];
	readonly sortedXOrder: string[];
	readonly xAxisType: XAxisType;
	readonly yDomain: YDomainOverrides;
	private readonly orderMap: Map<string, number>;
	private readonly flatCache = new Map<number, ProcessedData[]>();

	constructor(view: ChartView, data: ProcessedData[], groupBySet: string[], sortedXOrder: (number | Date | string)[], xAxisType: XAxisType) {
		this.view = view;
		this.data = data;
		this.groupBySet = groupBySet;
		this.xAxisType = xAxisType;
		this.sortedXOrder = sortedXOrder.map(v => toCompactString(v));

		this.orderMap = new Map<string, number>();
		this.sortedXOrder.forEach((x, i) => this.orderMap.set(x, i));

		this.yDomain = this.getYDomain();
	}

	abstract getChartIdentifiers(): ChartId[];
	abstract getGroupIdentifiers(): GroupId[];

	abstract getChartName(chartIndex: number): string;
	abstract getGroupName(groupIndex: number): string;

	getColorFromGroupIndex(groupIndex: number): string {
		return OBSIDIAN_COLOR_PALETTE[groupIndex % OBSIDIAN_COLOR_PALETTE.length];
	}

	hasMultipleGroups(): boolean {
		return this.getGroupIdentifiers().length > 1;
	}

	hasMultipleCharts(): boolean {
		return this.getChartIdentifiers().length > 1;
	}

	getFlat(chartIndex: number): ProcessedData[] {
		const cached = this.flatCache.get(chartIndex);
		if (cached) return cached;

		const data = this.data.filter(d => d.chartIndex === chartIndex);
		data.sort((a, b) => {
			const ia = this.orderMap.get(toCompactString(a.x)) ?? Infinity;
			const ib = this.orderMap.get(toCompactString(b.x)) ?? Infinity;
			return ia - ib;
		});

		this.flatCache.set(chartIndex, data);
		return data;
	}

	getStacked(chartIndex: number): ProcessedData[] {
		const xMap = new Map<number | Date | string, number>();
		const stackedData: ProcessedData[] = [];

		for (const entry of this.data) {
			if (entry.chartIndex !== chartIndex) {
				continue;
			}

			const prevY = xMap.get(entry.x) ?? 0;
			const newY = prevY + entry.y;

			stackedData.push({
				...entry,
				y: newY,
			});

			xMap.set(entry.x, newY);
		}

		return stackedData;
	}

	getYDomainForChart(chartIndex: number): [number, number] {
		const overrides = this.yDomain;

		const min = overrides.min ?? this.getChartYMin(chartIndex);
		const max = overrides.max ?? this.getChartYMax(chartIndex);

		return [min ?? 0, max ?? 0];
	}

	getYDomain(): YDomainOverrides {
		const viewOverrides = this.view.getYDomainOverrides();

		if (viewOverrides.synced) {
			viewOverrides.min ??= this.getGlobalYMin();
			viewOverrides.max ??= this.getGlobalYMax();
		}

		return viewOverrides;
	}

	getGlobalYMin(): number | null {
		let globalMin: number | null = null;

		for (let i = 0; i < this.getChartIdentifiers().length; i++) {
			const chartData = this.getFlat(i);
			for (const entry of chartData) {
				if (globalMin === null || entry.y < globalMin) {
					globalMin = entry.y;
				}
			}
		}

		return globalMin;
	}

	getGlobalYMax(): number | null {
		let globalMax: number | null = null;

		for (let i = 0; i < this.getChartIdentifiers().length; i++) {
			const chartData = this.getFlat(i);
			for (const entry of chartData) {
				if (globalMax === null || entry.y > globalMax) {
					globalMax = entry.y;
				}
			}
		}

		return globalMax;
	}

	getChartYMin(chartIndex: number): number | null {
		let chartMin: number | null = null;

		const chartData = this.getFlat(chartIndex);
		for (const entry of chartData) {
			if (chartMin === null || entry.y < chartMin) {
				chartMin = entry.y;
			}
		}

		return chartMin;
	}

	getChartYMax(chartIndex: number): number | null {
		let chartMax: number | null = null;

		const chartData = this.getFlat(chartIndex);
		for (const entry of chartData) {
			if (chartMax === null || entry.y > chartMax) {
				chartMax = entry.y;
			}
		}

		return chartMax;
	}
}

export class PropertySeparatedData extends AbstractDataWrapper<BasesPropertyId, string> {
	getChartIdentifiers(): BasesPropertyId[] {
		return this.view.data.properties;
	}

	getGroupIdentifiers(): string[] {
		return this.groupBySet;
	}

	getChartName(chartIndex: number): string {
		const chartId = this.getChartIdentifiers()[chartIndex];
		return this.view.config.getDisplayName(chartId) ?? `Chart ${chartIndex + 1}`;
	}

	getGroupName(groupIndex: number): string {
		return this.getGroupIdentifiers()[groupIndex] ?? `Group ${groupIndex + 1}`;
	}
}

export type DataWrapper = PropertySeparatedData;

export function emptyDataWrapper(view: ChartView): DataWrapper {
	return new PropertySeparatedData(view, [], [], [], 'category');
}

