import type { BasesEntry, GroupOption, QueryController } from 'obsidian';
import type { BasesPropertyId, ViewOption } from 'obsidian';
import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData, YDomainOverrides } from './data';
import { emptyDataWrapper, PropertySeparatedData } from './data';
import { ChartLayout } from './layout';
import { BaseChartView } from '../baseChartView';
import { AggregateMode, aggregateData, aggregateKey } from './aggregate';
import { renameToolbarButton, restoreToolbarButton } from '../ui/uiInjector';
import { COMMON_SETTINGS } from './types';
import { detectXAxisType, parseValueAsNumber, parseValueAsX, toCompactString } from '../utils/utils';
import type { ResolvedColors } from '../ui/colors';

export { AggregateMode, aggregateKey } from './aggregate';
export type { YDomainOverrides } from './data';

type ViewOptionItem = Exclude<ViewOption, GroupOption>;

export interface CommonViewOptionGroups {
	data: ViewOptionItem[];
	yAxis: ViewOptionItem[];
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

export abstract class DataChartView extends BaseChartView {
	private layout: ChartLayout | null = null;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller, containerEl);
	}

	abstract buildOption(
		data: DataWrapper,
		chartIndex: number,
		xName: string,
		yLabel: string,
		isGrouped: boolean,
		colors: ResolvedColors,
	): EChartsOption;

	protected onChartLoad(): void {
		this.layout = new ChartLayout(this, this.containerEl);
		renameToolbarButton(this.containerEl);
	}

	protected onChartUnload(): void {
		this.layout?.destroy();
		this.layout = null;
		restoreToolbarButton(this.containerEl);
	}

	processData(): DataWrapper {
		const xField = this.config.getAsPropertyId(COMMON_SETTINGS.X);
		const propertyOrder = this.config.getOrder();

		if (!xField) {
			return emptyDataWrapper();
		}

		const xAxisType = detectXAxisType(this.app, xField);

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

		const aggregateModes = new Map<number, AggregateMode>();
		for (let i = 0; i < propertyOrder.length; i++) {
			aggregateModes.set(i, this.getAggregateModeForProperty(propertyOrder[i]));
		}

		const aggregatedData = aggregateData(data, aggregateModes, this.type);

		const yDomain = this.getYDomainOverrides();
		const chartIds = propertyOrder;
		const chartNameMap = new Map(chartIds.map(id => [id, this.config.getDisplayName(id) ?? '']));

		const wrapper = new PropertySeparatedData(
			aggregatedData, groupBySet, sortedXValues, xAxisType,
			yDomain, chartIds, chartNameMap,
		);

		// For synced Y axes, backfill global min/max into the domain
		if (yDomain.synced) {
			yDomain.min ??= wrapper.getGlobalYMin();
			yDomain.max ??= wrapper.getGlobalYMax();
		}

		return wrapper;
	}

	processEntry(entry: BasesEntry, xField: BasesPropertyId, propertyOrder: BasesPropertyId[], groupIndex: number, xAxisType: import('../utils/utils').XAxisType): ProcessedData[] {
		try {
			const x = entry.getValue(xField);
			const xValues = parseValueAsX(x, xAxisType);
			const labelProp = this.getLabelProperty();

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

	getLabelProperty(): BasesPropertyId | null {
		return null;
	}

	getDefaultAggregateMode(): AggregateMode {
		return AggregateMode.SUM;
	}

	getYAxisLabel(chartName: string, propId?: BasesPropertyId): string {
		const mode = propId ? this.getAggregateModeForProperty(propId) : this.getDefaultAggregateMode();
		return mode !== AggregateMode.NONE ? `↑ ${chartName} (${mode})` : `↑ ${chartName}`;
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
