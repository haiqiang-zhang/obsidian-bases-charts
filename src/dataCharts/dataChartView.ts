import type { BasesEntry, BasesOptions, QueryController } from 'obsidian';
import type { BasesPropertyId, BasesAllOptions } from 'obsidian';
import { Menu, NullValue } from 'obsidian';
import type { EChartsOption } from 'echarts';
import type { DataWrapper, ProcessedData, YDomainOverrides } from './data';
import { emptyDataWrapper, PropertySeparatedData } from './data';
import { ChartLayout } from './layout';
import { BaseChartView } from '../baseChartView';
import { AggregateMode, aggregateData, aggregateKey } from './aggregate';
import { ChartToolbar } from '../ui/chartToolbar';
import { ChartFormulaEditor } from '../ui/chartFormulaEditor';
import { prepareChartGroups } from './grouping';
import { COMMON_SETTINGS } from './types';
import { bucketDateValues, buildDateTimeline, isDateProperty, normalizeDateGrouping } from './dateBuckets';
import type { DateGrouping } from './dateBuckets';
import { detectXAxisType, parseValueAsNumber, parseValueAsX, toXKey } from '../utils/utils';
import type { ResolvedColors } from '../ui/colors';
import { CHART_PALETTES, DEFAULT_CHART_PALETTE } from '../ui/chartPalettes';
import { getResolvedColor, resolveColors } from '../ui/colors';
import { GroupColorCustomModal } from '../ui/groupColorsModal';
import type { GroupColorEntry } from '../ui/groupColorsModal';
import { GROUP_COLOR_PRESETS, getGroupColorIconId, getGroupColorKeys, normalizeGroupColorChoice, readGroupColorConfig, resolveGroupColorChoice, withGroupColor } from './groupColors';
import type { GroupColorChoice } from './groupColors';

export { AggregateMode, aggregateKey } from './aggregate';
export type { YDomainOverrides } from './data';

export interface CommonViewOptionGroups {
	data: BasesOptions[];
	yAxis: BasesOptions[];
}

export interface ChartLegendEntry {
	name: string;
	colorIndex: number;
	groupIndex?: number;
	lineStyle?: 'solid' | 'dashed' | 'dotted';
	symbol?: 'circle' | 'rect' | 'diamond' | 'triangle';
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
	private toolbar: ChartToolbar | null = null;
	private formulaEditor: ChartFormulaEditor | null = null;
	private groupColorsModal: GroupColorCustomModal | null = null;
	private groupColorMenu: Menu | null = null;

	constructor(private readonly chartController: QueryController, containerEl: HTMLElement) {
		super(chartController, containerEl);
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
		this.containerEl.addClass('bases-data-chart-view');
		this.layout = new ChartLayout(this, this.containerEl);
		this.formulaEditor = this.addChild(new ChartFormulaEditor(this, this.chartController));
		this.toolbar = this.addChild(new ChartToolbar(this));
	}

	protected onChartUnload(): void {
		this.groupColorMenu?.hide();
		this.groupColorMenu = null;
		this.groupColorsModal?.close();
		this.groupColorsModal = null;
		this.layout?.destroy();
		this.layout = null;
		if (this.toolbar) this.removeChild(this.toolbar);
		this.toolbar = null;
		if (this.formulaEditor) this.removeChild(this.formulaEditor);
		this.formulaEditor = null;
		this.containerEl.removeClass('bases-data-chart-view');
	}

	openAxisSettings(axis: 'x' | 'y'): void {
		this.toolbar?.openAxis(axis);
	}

	openGroupColors(key: string, anchor: HTMLElement): void {
		const group = this.getGroupColorEntries().find(group => group.key === key);
		if (!group) return;
		this.groupColorMenu?.hide();
		const menu = new Menu();
		this.groupColorMenu = menu;
		menu.addItem(item => item.setTitle(group.name).setDisabled(true));
		menu.addSeparator();
		menu.addItem(item => item.setTitle('Automatic').setIcon('rotate-ccw')
			.setChecked(group.choice === null).onClick(() => this.setGroupColor(key, null)));
		const isDark = this.containerEl.doc.body.classList.contains('theme-dark');
		for (const preset of GROUP_COLOR_PRESETS) {
			menu.addItem(item => item.setTitle(preset.name).setIcon(getGroupColorIconId(preset.id, isDark))
				.setChecked(group.choice?.type === 'preset' && group.choice.value === preset.id)
				.onClick(() => this.setGroupColor(key, { type: 'preset', value: preset.id })));
		}
		menu.addSeparator();
		menu.addItem(item => item.setTitle('Custom color…').setIcon('palette')
			.setChecked(group.choice?.type === 'custom').onClick(() => {
				if (!this.getGroupColorEntries().some(group => group.key === key)) return;
				menu.hide();
				this.groupColorsModal?.close();
				this.groupColorsModal = new GroupColorCustomModal(this, key);
				this.groupColorsModal.open();
			}));
		if (this.hasGroupColors()) {
			menu.addSeparator();
			menu.addItem(item => item.setTitle('Reset all group colors').setIcon('rotate-ccw').onClick(() => this.resetGroupColors()));
		}
		anchor.setAttribute('aria-expanded', 'true');
		menu.onHide(() => {
			anchor.setAttribute('aria-expanded', 'false');
			if (this.groupColorMenu === menu) this.groupColorMenu = null;
		});
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, anchor.ownerDocument);
	}

	getGroupColorEntries(): GroupColorEntry[] {
		const nativeGroups = this.data?.groupedData ?? [];
		const keys = getGroupColorKeys(nativeGroups);
		if (!keys.some(key => key !== null)) return [];
		const groups = prepareChartGroups(nativeGroups);
		const colors = resolveColors(this.containerEl, this.config.get(COMMON_SETTINGS.COLOR_PALETTE));
		const isDark = this.containerEl.doc.body.classList.contains('theme-dark');
		const { overrides } = readGroupColorConfig(this.config.get(COMMON_SETTINGS.GROUP_COLORS));
		return groups.flatMap(group => {
			const key = keys[group.groupIndex];
			if (key === null) return [];
			const automaticColor = getResolvedColor(colors.palette, colors.accent, group.groupIndex, groups.length > 1);
			const choice = overrides[key] ?? null;
			return [{ key, name: group.label, groupIndex: group.groupIndex, choice, automaticColor,
				color: resolveGroupColorChoice(choice, isDark) ?? automaticColor }];
		});
	}

	getResolvedGroupColors(): ReadonlyMap<number, string> {
		const { overrides } = readGroupColorConfig(this.config.get(COMMON_SETTINGS.GROUP_COLORS));
		if (!Object.keys(overrides).length) return new Map();
		const isDark = this.containerEl.doc.body.classList.contains('theme-dark');
		const keys = getGroupColorKeys(this.data?.groupedData ?? []);
		const colors = new Map<number, string>();
		keys.forEach((key, index) => {
			const color = key === null ? undefined : resolveGroupColorChoice(overrides[key], isDark);
			if (color) colors.set(index, color);
		});
		return colors;
	}

	setGroupColor(key: string, choice: GroupColorChoice | null): void {
		if (!getGroupColorKeys(this.data?.groupedData ?? []).includes(key)) return;
		if (choice !== null && !normalizeGroupColorChoice(choice)) return;
		this.config.set(COMMON_SETTINGS.GROUP_COLORS, withGroupColor(this.config.get(COMMON_SETTINGS.GROUP_COLORS), key, choice));
		this.events.trigger('data-updated');
	}

	hasGroupColors(): boolean {
		return Object.keys(readGroupColorConfig(this.config.get(COMMON_SETTINGS.GROUP_COLORS)).overrides).length > 0;
	}

	resetGroupColors(): void {
		this.config.set(COMMON_SETTINGS.GROUP_COLORS, null);
		this.events.trigger('data-updated');
	}

	canEditFormulas(): boolean {
		return this.formulaEditor?.canOpen() ?? false;
	}

	openFormulaEditor(anchor: HTMLElement, axis: 'x' | 'y', propertyId?: BasesPropertyId): void {
		this.formulaEditor?.open(anchor, axis, propertyId);
	}

	getYProperties(): BasesPropertyId[] {
		const configured = this.config.get(COMMON_SETTINGS.Y);
		// Native order is a reserved Bases field without a public setter. Keep
		// reading it for existing charts until the user edits the new Y menu.
		if (!Array.isArray(configured)) return this.config.getOrder();
		return [...new Set(configured.filter((id): id is BasesPropertyId =>
			typeof id === 'string' && /^(file|note|formula)\..+/.test(id)))];
	}

	isDateXAxis(): boolean {
		const property = this.config?.getAsPropertyId(COMMON_SETTINGS.X);
		if (!property) return false;
		const entries = this.data?.data ?? [];
		const values = (function* () {
			for (const entry of entries) yield entry.getValue(property);
		})();
		return isDateProperty(this.app, property, values);
	}

	getXDateGrouping(): DateGrouping {
		const setting = this.config?.get(COMMON_SETTINGS.X_DATE_GROUPING);
		if (!setting || typeof setting !== 'object' || Array.isArray(setting)) return 'exact';
		const { property, unit } = setting as { property?: unknown; unit?: unknown };
		return property === this.config.getAsPropertyId(COMMON_SETTINGS.X) && this.isDateXAxis()
			? normalizeDateGrouping(unit) : 'exact';
	}

	setXDateGrouping(unit: DateGrouping): void {
		const property = this.config?.getAsPropertyId(COMMON_SETTINGS.X);
		if (property) this.config.set(COMMON_SETTINGS.X_DATE_GROUPING, { property, unit: normalizeDateGrouping(unit) });
	}

	supportsMissingDates(): boolean {
		return ['chart-bar', 'chart-line', 'chart-area', 'chart-scatter'].includes(this.type) && this.isDateXAxis();
	}

	getShowMissingDates(): boolean {
		const setting = this.config?.get(COMMON_SETTINGS.X_DATE_GAPS);
		if (!setting || typeof setting !== 'object' || Array.isArray(setting) || !this.supportsMissingDates()) return false;
		const { property, enabled } = setting as { property?: unknown; enabled?: unknown };
		return property === this.config.getAsPropertyId(COMMON_SETTINGS.X) && enabled === true;
	}

	setShowMissingDates(enabled: boolean): void {
		const property = this.config?.getAsPropertyId(COMMON_SETTINGS.X);
		if (property) this.config.set(COMMON_SETTINGS.X_DATE_GAPS, { property, enabled });
	}

	processData(): DataWrapper {
		const xField = this.config.getAsPropertyId(COMMON_SETTINGS.X);
		const propertyOrder = this.getYProperties();

		if (!xField) {
			return emptyDataWrapper();
		}

		const dateGrouping = this.getXDateGrouping();
		const xAxisType = dateGrouping === 'exact' ? detectXAxisType(this.app, xField) : 'category';
		const groups = prepareChartGroups(this.data.groupedData);
		const visiblePaths = new Set(groups.flatMap(group => group.entries.map(entry => entry.file.path)));

		const sortedXValues: (number | Date | string)[] = [];
		const seenXKeys = new Set<string>();
		// Group order controls series, while Sort still controls the X axis.
		for (const entry of this.data.data) {
			if (!visiblePaths.has(entry.file.path)) continue;
			const value = entry.getValue(xField);
			const xVals = dateGrouping === 'exact'
				? parseValueAsX(value, xAxisType, xField) : bucketDateValues(value, dateGrouping, xField);
			if (xVals) {
				for (const v of xVals) {
					const key = toXKey(v);
					if (!seenXKeys.has(key)) {
						seenXKeys.add(key);
						sortedXValues.push(v);
					}
				}
			}
		}
		if (dateGrouping !== 'exact') {
			// Calendar buckets form a timeline, independent of file-name ordering.
			const descending = this.config.getSort().find(sort => sort.property === xField)?.direction === 'DESC';
			sortedXValues.sort((a, b) => String(a).localeCompare(String(b)) * (descending ? -1 : 1));
		}

		const data: ProcessedData[] = [];
		const groupBySet = groups.map(group => group.label);

		for (const group of groups) {

			for (const entry of group.entries) {
				const processedEntry = this.processEntry(entry, xField, propertyOrder, group.groupIndex, xAxisType, dateGrouping);
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
			dateGrouping !== 'exact' && this.getShowMissingDates()
				? buildDateTimeline(sortedXValues.map(String), dateGrouping) : null,
			this.data.groupedData.some(group => group.key !== undefined),
		);

		// For synced Y axes, backfill global min/max into the domain
		if (yDomain.synced) {
			yDomain.min ??= wrapper.getGlobalYMin();
			yDomain.max ??= wrapper.getGlobalYMax();
		}

		return wrapper;
	}

	processEntry(entry: BasesEntry, xField: BasesPropertyId, propertyOrder: BasesPropertyId[], groupIndex: number, xAxisType: import('../utils/utils').XAxisType, dateGrouping: DateGrouping = 'exact'): ProcessedData[] {
		try {
			const x = entry.getValue(xField);
			const xValues = dateGrouping === 'exact'
				? parseValueAsX(x, xAxisType, xField) : bucketDateValues(x, dateGrouping, xField);
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
				const include = yValue !== null || (isCountMode && rawValue !== null
					&& !(rawValue instanceof NullValue));

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
		return mode !== AggregateMode.NONE ? `${chartName} (${mode})` : chartName;
	}

	getChartCount(data: DataWrapper): number {
		return data.getChartIdentifiers().length;
	}

	getChartData(data: DataWrapper, chartIndex: number): ProcessedData[] {
		return data.getFlat(chartIndex);
	}

	getChartLegend(data: DataWrapper, _colors?: ResolvedColors): ChartLegendEntry[] {
		return data.hasMultipleGroups() || this.data?.groupedData.some(group => group.key !== undefined)
			? data.getGroupIdentifiers().map((_, index) => ({ name: data.getGroupName(index), colorIndex: index, groupIndex: index }))
			: [];
	}

	getChartLabel(data: DataWrapper, chartIndex: number): string {
		return this.getChartData(data, chartIndex).some(point => !point.isNumeric)
			? `${data.getChartName(chartIndex)} (Count)`
			: this.getYAxisLabel(data.getChartName(chartIndex), this.getYProperties()[chartIndex]);
	}

	getChartMessage(data: DataWrapper, _chartIndex: number): string | null {
		return data.dateTimeline?.error ?? null;
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
			data: [{
				displayName: 'Color palette',
				type: 'dropdown',
				key: COMMON_SETTINGS.COLOR_PALETTE,
				default: DEFAULT_CHART_PALETTE,
				options: Object.fromEntries(CHART_PALETTES.map(palette => [palette.id, palette.name])),
			}],
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

	static buildViewOptions(groups: CommonViewOptionGroups): BasesAllOptions[] {
		const result: BasesAllOptions[] = [...groups.data];
		result.push({
			type: 'group',
			displayName: 'Y scale',
			items: groups.yAxis,
		});
		return result;
	}
}
