import type { BasesEntry, EventRef, QueryController } from 'obsidian';
import type { BasesPropertyId, ViewOption } from 'obsidian';
import { BasesView, Events } from 'obsidian';
import type { DataWrapper, ProcessedData } from './ChartData';
import { emptyDataWrapper, GroupSeparatedData, PropertySeparatedData } from './ChartData';
import { ChartLayout } from './ChartLayout';
import { SCATTER_SETTINGS } from './charts/scatter-options';
import { scatterViewOptions } from './charts/scatter-options';
import { lineViewOptions } from './charts/line-options';
import { barViewOptions } from './charts/bar-options';
import { pieViewOptions } from './charts/pie-options';
import { detectXAxisType, parseValueAsNumber, parseValueAsX, toCompactString } from './utils';

export const SCATTER_CHART_VIEW_TYPE = 'chart-scatter';
export const LINE_CHART_VIEW_TYPE = 'chart-line';
export const BAR_CHART_VIEW_TYPE = 'chart-bar';
export const PIE_CHART_VIEW_TYPE = 'chart-pie';

export type ChartViewType = typeof SCATTER_CHART_VIEW_TYPE | typeof LINE_CHART_VIEW_TYPE | typeof BAR_CHART_VIEW_TYPE | typeof PIE_CHART_VIEW_TYPE;

export const COMMON_SETTINGS = {
	X: 'x',
	MULTI_CHART: 'multi-chart-mode',
	SYNC_Y_AXES: 'sync-y-axes',
	MIN_Y_OVERRIDE: 'min-y-override',
	MAX_Y_OVERRIDE: 'max-y-override',
	AGGREGATE: 'aggregate',
} as const;


export enum NullHandling {
	SKIP = 'Skip',
	ZERO = 'Treat as 0',
}

export enum MultiChartMode {
	GROUP = 'Separate by group',
	PROPERTY = 'Separate by property',
}

export enum AggregateMode {
	NONE = 'None',
	AVERAGE = 'Average',
	SUM = 'Sum',
	COUNT = 'Count',
	MIN = 'Min',
	MAX = 'Max',
}

export interface YDomainOverrides {
	min: number | null;
	max: number | null;
	synced: boolean;
}

function parseConfigAsNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		if (value.trim() === '') {
			return null;
		}
		const parsed = Number(value);
		if (!isNaN(parsed)) {
			return parsed;
		}
	}
	return null;
}

export class ChartView extends BasesView {
	readonly type: ChartViewType;
	readonly scrollEl: HTMLElement;
	readonly events: Events;
	private layout: ChartLayout | null = null;

	constructor(type: ChartViewType, controller: QueryController, scrollEl: HTMLElement) {
		super(controller);
		this.type = type;
		this.scrollEl = scrollEl;
		this.events = new Events();
	}

	private cssChangeRef: EventRef | null = null;

	onload(): void {
		this.scrollEl.addClass('bases-chart-view');
		this.layout = new ChartLayout(this, this.scrollEl);
		this.renameToolbarButton();

		this.cssChangeRef = this.app.workspace.on('css-change', () => {
			this.events.trigger('data-updated');
		});
	}

	private renameToolbarButton(): void {
		const container = this.scrollEl.parentElement;
		if (!container) return;
		const label = container.querySelector('.bases-toolbar-properties-menu .text-button-label');
		if (label) {
			label.textContent = 'Y axis';
		}
	}

	onunload(): void {
		if (this.cssChangeRef) {
			this.app.workspace.offref(this.cssChangeRef);
			this.cssChangeRef = null;
		}
		this.layout?.destroy();
		this.layout = null;
		this.scrollEl.removeClass('bases-chart-view');
		this.restoreToolbarButton();
	}

	private restoreToolbarButton(): void {
		const container = this.scrollEl.parentElement;
		if (!container) return;
		const label = container.querySelector('.bases-toolbar-properties-menu .text-button-label');
		if (label) {
			label.textContent = 'Properties';
		}
	}

	onDataUpdated(): void {
		this.events.trigger('data-updated');
	}

	processData(): DataWrapper {
		const xField = this.config.getAsPropertyId(COMMON_SETTINGS.X);
		const mode = this.config.get(COMMON_SETTINGS.MULTI_CHART) ?? MultiChartMode.PROPERTY;
		const propertyOrder = this.config.getOrder();

		if (mode !== MultiChartMode.GROUP && mode !== MultiChartMode.PROPERTY) {
			/* eslint-disable-next-line @typescript-eslint/no-base-to-string --
			 * this is a safety check to catch when the saved data does not match the type definitions
			 * (mostly because the unknown type if the config.get method)
			 */
			console.warn(`Invalid multi chart mode: ${String(mode)}`);
			return emptyDataWrapper(this);
		}

		if (!xField) {
			return emptyDataWrapper(this);
		}

		const xAxisType = detectXAxisType(this.app, xField);

		// Extract x order from ungrouped data (pre-sorted by Bases, ignoring group)
		const sortedXValues: (number | Date | string)[] = [];
		const seenXKeys = new Set<string>();
		for (const entry of this.data.data) {
			const xVals = parseValueAsX(entry.getValue(xField), xAxisType);
			if (xVals) {
				for (const v of xVals) {
					const key = toCompactString(v);
					if (!seenXKeys.has(key)) {
						seenXKeys.add(key);
						sortedXValues.push(v);
					}
				}
			}
		}

		const data: ProcessedData[] = [];
		const groupBySet = this.data.groupedData.map(g => g.key?.toString()).filter(k => k != null);

		for (const group of this.data?.groupedData ?? []) {
			const groupKey = group.key?.toString();
			let groupIndex: number;
			if (groupKey == null) {
				groupIndex = 0;
			} else {
				groupIndex = groupBySet.indexOf(groupKey);
			}

			for (const entry of group.entries) {
				const processedEntry = this.processEntry(entry, xField, propertyOrder, groupIndex, mode, xAxisType);
				data.push(...processedEntry);
			}
		}

		const aggregatedData = aggregateData(data, this.config.get(COMMON_SETTINGS.AGGREGATE) as AggregateMode | undefined, this.type);

		if (mode === MultiChartMode.GROUP) {
			return new GroupSeparatedData(this, aggregatedData, groupBySet, sortedXValues, xAxisType);
		} else {
			return new PropertySeparatedData(this, aggregatedData, groupBySet, sortedXValues, xAxisType);
		}
	}

	processEntry(entry: BasesEntry, xField: BasesPropertyId, propertyOrder: BasesPropertyId[], groupIndex: number, mode: MultiChartMode, xAxisType: import('./utils').XAxisType): ProcessedData[] {
		try {
			const x = entry.getValue(xField);
			const xValues = parseValueAsX(x, xAxisType);
			const labelProp = this.config.getAsPropertyId(SCATTER_SETTINGS.LABEL_PROP);

			if (xValues === null) {
				return [];
			}

			const isCountMode = this.getAggregateMode() === AggregateMode.COUNT;

			const result: ProcessedData[] = [];
			let i = 0;
			for (const prop of propertyOrder) {
				const rawValue = entry.getValue(prop);
				const yValue = parseValueAsNumber(rawValue);
				const label = labelProp ? entry.getValue(labelProp)?.toString() : undefined;
				const include = yValue !== null || (isCountMode && rawValue !== null);

				if (include) {
					for (const xValue of xValues) {
						result.push({
							x: xValue,
							y: yValue ?? 1,
							isNumeric: yValue !== null,
							groupIndex: mode === MultiChartMode.GROUP ? i : groupIndex,
							chartIndex: mode === MultiChartMode.GROUP ? groupIndex : i,
							files: [entry.file.path],
							fileValues: [yValue ?? 1],
							label: label,
						});
					}
				}

				i++;
			}

			return result;
		} catch (e) {
			console.warn('Error processing entry', entry, e);
		}

		return [];
	}

	getAggregateMode(): AggregateMode {
		return (this.config.get(COMMON_SETTINGS.AGGREGATE) as AggregateMode | undefined) ?? AggregateMode.NONE;
	}

	getYAxisLabel(chartName: string): string {
		const mode = this.getAggregateMode();
		return mode !== AggregateMode.NONE ? `↑ ${chartName} (${mode})` : `↑ ${chartName}`;
	}

	hasDomainOverride(): boolean {
		const overrides = this.getYDomainOverrides();
		return overrides.min !== null || overrides.max !== null || overrides.synced;
	}

	getYDomainOverrides(): YDomainOverrides {
		const min = this.config.get(COMMON_SETTINGS.MIN_Y_OVERRIDE);
		const max = this.config.get(COMMON_SETTINGS.MAX_Y_OVERRIDE);
		const synced = Boolean(this.config.get(COMMON_SETTINGS.SYNC_Y_AXES));

		return {
			min: parseConfigAsNumber(min),
			max: parseConfigAsNumber(max),
			synced,
		};
	}

	async openFile(filePath: string, newTab: boolean): Promise<void> {
		const tFile = this.app.vault.getFileByPath(filePath);
		if (!tFile) {
			return;
		}

		const activeLeaf = this.app.workspace.getLeaf(newTab ? 'tab' : false);
		if (activeLeaf) {
			await activeLeaf.openFile(tFile, {
				state: { mode: 'source' },
			});
		}
	}

	static getViewOptions(type: ChartViewType): ViewOption[] {
		if (type === SCATTER_CHART_VIEW_TYPE) {
			return scatterViewOptions();
		} else if (type === LINE_CHART_VIEW_TYPE) {
			return lineViewOptions();
		} else if (type === BAR_CHART_VIEW_TYPE) {
			return barViewOptions();
		} else if (type === PIE_CHART_VIEW_TYPE) {
			return pieViewOptions();
		} else {
			return [];
		}
	}

	static commonViewOptions(): ViewOption[] {
		return [
			{
				displayName: 'Multi chart mode',
				type: 'dropdown',
				key: COMMON_SETTINGS.MULTI_CHART,
				options: {
					[MultiChartMode.GROUP]: MultiChartMode.GROUP,
					[MultiChartMode.PROPERTY]: MultiChartMode.PROPERTY,
				},
				default: MultiChartMode.PROPERTY,
			},
			{
				displayName: 'X axis',
				type: 'property',
				key: COMMON_SETTINGS.X,
				filter: prop => !prop.startsWith('file.'),
				placeholder: 'Property',
			},
			{
				displayName: 'Sync Y axes',
				type: 'toggle',
				key: COMMON_SETTINGS.SYNC_Y_AXES,
				default: false,
			},
			{
				displayName: 'Min Y override',
				type: 'text',
				key: COMMON_SETTINGS.MIN_Y_OVERRIDE,
				placeholder: 'Leave empty to disable',
				default: '',
			},
			{
				displayName: 'Max Y override',
				type: 'text',
				key: COMMON_SETTINGS.MAX_Y_OVERRIDE,
				placeholder: 'Leave empty to disable',
				default: '',
			},
		];
	}

	static aggregateOption(includeNone: boolean): ViewOption {
		const options: Record<string, string> = {};
		if (includeNone) options[AggregateMode.NONE] = AggregateMode.NONE;
		options[AggregateMode.SUM] = AggregateMode.SUM;
		options[AggregateMode.AVERAGE] = AggregateMode.AVERAGE;
		options[AggregateMode.COUNT] = AggregateMode.COUNT;
		options[AggregateMode.MIN] = AggregateMode.MIN;
		options[AggregateMode.MAX] = AggregateMode.MAX;
		return {
			displayName: 'Aggregate',
			type: 'dropdown',
			key: COMMON_SETTINGS.AGGREGATE,
			options,
			default: includeNone ? AggregateMode.NONE : AggregateMode.SUM,
		};
	}
}

function aggregateData(data: ProcessedData[], mode: AggregateMode | undefined, chartType: ChartViewType): ProcessedData[] {
	// Group by x + chartIndex + groupIndex
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

	let effectiveMode = mode ?? AggregateMode.NONE;

	if (effectiveMode === AggregateMode.NONE) {
		if (chartType === SCATTER_CHART_VIEW_TYPE) return data;
		// For line/bar with non-numeric data, force COUNT
		const hasNonNumeric = data.some(d => !d.isNumeric);
		if (hasNonNumeric) {
			effectiveMode = AggregateMode.COUNT;
		} else {
			const hasDuplicates = Array.from(buckets.values()).some(b => b.length > 1);
			if (!hasDuplicates) return data;
			effectiveMode = AggregateMode.SUM;
		}
	}

	const result: ProcessedData[] = [];
	for (const bucket of buckets.values()) {
		const first = bucket[0];
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
