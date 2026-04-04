import type { BasesEntry, EventRef, GroupOption, QueryController } from 'obsidian';
import type { BasesPropertyId, ViewOption } from 'obsidian';
import { BasesView, Events } from 'obsidian';

type ViewOptionItem = Exclude<ViewOption, GroupOption>;

export interface CommonViewOptionGroups {
	data: ViewOptionItem[];
	yAxis: ViewOptionItem[];
}
import type { DataWrapper, ProcessedData } from './chartData';
import { emptyDataWrapper, PropertySeparatedData } from './chartData';
import { ChartLayout } from './chartLayout';
import { renameToolbarButton, restoreToolbarButton } from './uiInjector';
import { SCATTER_SETTINGS } from './charts/scatterOptions';
import { scatterViewOptions } from './charts/scatterOptions';
import { lineViewOptions } from './charts/lineOptions';
import { barViewOptions } from './charts/barOptions';
import { pieViewOptions } from './charts/pieOptions';
import { detectXAxisType, parseValueAsNumber, parseValueAsX, toCompactString } from './utils';

export const SCATTER_CHART_VIEW_TYPE = 'chart-scatter';
export const LINE_CHART_VIEW_TYPE = 'chart-line';
export const BAR_CHART_VIEW_TYPE = 'chart-bar';
export const PIE_CHART_VIEW_TYPE = 'chart-pie';

export type ChartViewType = typeof SCATTER_CHART_VIEW_TYPE | typeof LINE_CHART_VIEW_TYPE | typeof BAR_CHART_VIEW_TYPE | typeof PIE_CHART_VIEW_TYPE;

export const COMMON_SETTINGS = {
	X: 'x',
	SYNC_Y_AXES: 'sync-y-axes',
	MIN_Y_OVERRIDE: 'min-y-override',
	MAX_Y_OVERRIDE: 'max-y-override',
} as const;

export function aggregateKey(propId: BasesPropertyId): string {
	return `aggregate:${propId}`;
}


export enum NullHandling {
	SKIP = 'Leave gap',
	ZERO = 'Fill with 0',
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
	readonly containerEl: HTMLElement;
	readonly events: Events;
	private layout: ChartLayout | null = null;

	constructor(type: ChartViewType, controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this.type = type;
		this.containerEl = containerEl;
		this.events = new Events();
	}

	private cssChangeRef: EventRef | null = null;

	onload(): void {
		this.containerEl.addClass('bases-chart-view');
		this.layout = new ChartLayout(this, this.containerEl);
		renameToolbarButton(this.containerEl);

		this.cssChangeRef = this.app.workspace.on('css-change', () => {
			this.events.trigger('data-updated');
		});
	}

	onunload(): void {
		if (this.cssChangeRef) {
			this.app.workspace.offref(this.cssChangeRef);
			this.cssChangeRef = null;
		}
		this.layout?.destroy();
		this.layout = null;
		this.containerEl.removeClass('bases-chart-view');
		restoreToolbarButton(this.containerEl);
	}

	onDataUpdated(): void {
		this.events.trigger('data-updated');
	}

	processData(): DataWrapper {
		const xField = this.config.getAsPropertyId(COMMON_SETTINGS.X);
		const propertyOrder = this.config.getOrder();

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
				const processedEntry = this.processEntry(entry, xField, propertyOrder, groupIndex, xAxisType);
				data.push(...processedEntry);
			}
		}

		// Build per-chart aggregate mode map
		const aggregateModes = new Map<number, AggregateMode>();
		for (let i = 0; i < propertyOrder.length; i++) {
			aggregateModes.set(i, this.getAggregateModeForProperty(propertyOrder[i]));
		}

		const aggregatedData = aggregateData(data, aggregateModes, this.type);

		return new PropertySeparatedData(this, aggregatedData, groupBySet, sortedXValues, xAxisType);
	}

	processEntry(entry: BasesEntry, xField: BasesPropertyId, propertyOrder: BasesPropertyId[], groupIndex: number, xAxisType: import('./utils').XAxisType): ProcessedData[] {
		try {
			const x = entry.getValue(xField);
			const xValues = parseValueAsX(x, xAxisType);
			const labelProp = this.config.getAsPropertyId(SCATTER_SETTINGS.LABEL_PROP);

			if (xValues === null) {
				return [];
			}

			const result: ProcessedData[] = [];
			let i = 0;
			for (const prop of propertyOrder) {
				const rawValue = entry.getValue(prop);
				const yValue = parseValueAsNumber(rawValue);
				const label = labelProp ? entry.getValue(labelProp)?.toString() : undefined;
				const isCountMode = this.getAggregateModeForProperty(prop) === AggregateMode.COUNT;
				const include = yValue !== null || (isCountMode && rawValue !== null);

				if (include) {
					for (const xValue of xValues) {
						result.push({
							x: xValue,
							y: yValue ?? 1,
							isNumeric: yValue !== null,
							groupIndex: groupIndex,
							chartIndex: i,
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

	getAggregateModeForProperty(propId: BasesPropertyId): AggregateMode {
		const mode = this.config.get(aggregateKey(propId)) as AggregateMode | undefined;
		if (mode && Object.values(AggregateMode).includes(mode)) return mode;
		return this.getDefaultAggregateMode();
	}

	getDefaultAggregateMode(): AggregateMode {
		return this.type === SCATTER_CHART_VIEW_TYPE ? AggregateMode.NONE : AggregateMode.SUM;
	}

	getYAxisLabel(chartName: string, propId?: BasesPropertyId): string {
		const mode = propId ? this.getAggregateModeForProperty(propId) : this.getDefaultAggregateMode();
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

	static commonViewOptionGroups(): CommonViewOptionGroups {
		return {
			data: [
				{
					displayName: 'X axis',
					type: 'property',
					key: COMMON_SETTINGS.X,
					filter: prop => !prop.startsWith('file.'),
					placeholder: 'Property',
				},
			],
			yAxis: [
				{
					displayName: 'Sync across charts',
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
			],
		};
	}

	static buildViewOptions(groups: CommonViewOptionGroups): ViewOption[] {
		const result: ViewOption[] = [...groups.data];
		result.push({
			type: 'group',
			displayName: 'Y axes',
			items: groups.yAxis,
		});
		return result;
	}
}

function aggregateData(data: ProcessedData[], modes: Map<number, AggregateMode>, chartType: ChartViewType): ProcessedData[] {
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

	const result: ProcessedData[] = [];
	for (const bucket of buckets.values()) {
		const first = bucket[0];
		let effectiveMode = modes.get(first.chartIndex) ?? AggregateMode.NONE;

		if (effectiveMode === AggregateMode.NONE) {
			if (chartType === SCATTER_CHART_VIEW_TYPE) {
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
