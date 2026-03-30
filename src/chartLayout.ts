import type { EChartsOption } from 'echarts';
import { debounce } from 'obsidian';
import type { DataWrapper } from './chartData';
import type { ChartView } from './chartView';
import { AggregateMode, aggregateKey, BAR_CHART_VIEW_TYPE, COMMON_SETTINGS, LINE_CHART_VIEW_TYPE, NullHandling, PIE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from './chartView';
import { LINE_SETTINGS } from './charts/lineOptions';
import { BAR_SETTINGS } from './charts/barOptions';
import { PIE_SETTINGS } from './charts/pieOptions';
import { ChartRenderer } from './charts/chartRenderer';
import { resolveColors, type ResolvedColors } from './charts/echartsSetup';
import { buildBarOption } from './charts/barOptions';
import { buildLineOption } from './charts/lineOptions';
import { buildPieOption } from './charts/pieOptions';
import { buildScatterOption } from './charts/scatterOptions';
import { OBSIDIAN_COLOR_PALETTE } from './utils';

export class ChartLayout {
	private renderers: ChartRenderer[] = [];
	private legendEl: HTMLElement;
	private gridEl: HTMLElement;
	private debouncedUpdate = debounce(() => this.update(), 50, true);

	constructor(
		private view: ChartView,
		private containerEl: HTMLElement,
	) {
		this.legendEl = containerEl.createDiv({ cls: 'bases-charts-plot-legend' });
		this.gridEl = containerEl.createDiv({ cls: 'bases-charts-plot-grid' });

		view.events.on('data-updated', () => this.debouncedUpdate());
	}

	update(): void {
		const data = this.view.processData();
		const chartIds = data.getChartIdentifiers();

		this.renderLegend(data);
		this.reconcileRenderers(chartIds.length);

		const xField = this.view.config.getAsPropertyId(COMMON_SETTINGS.X);
		const xName = xField ? `${this.view.config.getDisplayName(xField)} →` : '';

		const colors = resolveColors(this.containerEl);

		const propertyOrder = this.view.config.getOrder();

		for (let i = 0; i < chartIds.length; i++) {
			const renderer = this.renderers[i];
			const isGrouped = data.hasMultipleGroups();
			const chartData = data.getFlat(i);
			const propId = propertyOrder[i];

			if (chartData.length === 0) {
				renderer.showMessage(
					'Non-numeric properties require Count aggregate.',
					propId ? {
						label: 'Use Count',
						onClick: () => {
							this.view.config.set(aggregateKey(propId), AggregateMode.COUNT);
						},
					} : undefined,
				);
				continue;
			}

			const hasNonNumeric = chartData.some(d => !d.isNumeric);
			const yLabel = hasNonNumeric
				? `↑ ${data.getChartName(i)} (Count)`
				: this.view.getYAxisLabel(data.getChartName(i), propId);
			const option = this.buildOption(data, i, xName, yLabel, isGrouped, colors);
			renderer.setOption(option);
		}
	}

	private buildOption(
		data: DataWrapper,
		chartIndex: number,
		xName: string,
		yLabel: string,
		isGrouped: boolean,
		colors: ResolvedColors,
	): EChartsOption {
		const type = this.view.type;

		if (type === SCATTER_CHART_VIEW_TYPE) {
			const propId = this.view.config.getOrder()[chartIndex];
			const isNoneAggregate = propId ? this.view.getAggregateModeForProperty(propId) === AggregateMode.NONE : true;
			return buildScatterOption(data, chartIndex, xName, yLabel, isGrouped, colors, isNoneAggregate);
		} else if (type === LINE_CHART_VIEW_TYPE) {
			const nullHandling = (this.view.config.get(LINE_SETTINGS.NULL_HANDLING) as NullHandling | undefined) ?? NullHandling.SKIP;
			const treatNullAsZero = nullHandling === NullHandling.ZERO;
			return buildLineOption(data, chartIndex, xName, yLabel, isGrouped, colors, treatNullAsZero);
		} else if (type === BAR_CHART_VIEW_TYPE) {
			const showLabels = Boolean(this.view.config.get(BAR_SETTINGS.SHOW_LABELS) ?? true);
			const showPercentages = Boolean(this.view.config.get(BAR_SETTINGS.SHOW_PERCENTAGES) ?? false);
			const hasDomainOverride = this.view.hasDomainOverride();
			return buildBarOption(data, chartIndex, xName, yLabel, isGrouped, colors, showLabels, showPercentages, hasDomainOverride);
		} else if (type === PIE_CHART_VIEW_TYPE) {
			const showLabels = Boolean(this.view.config.get(PIE_SETTINGS.SHOW_LABELS) ?? true);
			const showPercentages = Boolean(this.view.config.get(PIE_SETTINGS.SHOW_PERCENTAGES) ?? false);
			const ignoreNull = Boolean(this.view.config.get(PIE_SETTINGS.IGNORE_NULL) ?? true);
			return buildPieOption(data, chartIndex, colors, showLabels, showPercentages, ignoreNull);
		}

		return {};
	}

	private renderLegend(data: DataWrapper): void {
		this.legendEl.empty();
		const groupIds = data.getGroupIdentifiers();
		if (groupIds.length <= 1) {
			this.legendEl.addClass('bases-charts-hidden');
			return;
		}
		this.legendEl.removeClass('bases-charts-hidden');

		for (let i = 0; i < groupIds.length; i++) {
			const itemEl = this.legendEl.createDiv({ cls: 'bases-charts-plot-legend-item' });
			const colorEl = itemEl.createDiv({ cls: 'bases-charts-plot-legend-color' });
			colorEl.style.setProperty('--color', OBSIDIAN_COLOR_PALETTE[i % OBSIDIAN_COLOR_PALETTE.length]);
			itemEl.createEl('span', { cls: 'bases-charts-plot-legend-label', text: data.getGroupName(i) });
		}
	}

	private reconcileRenderers(count: number): void {
		// Remove excess renderers
		while (this.renderers.length > count) {
			const renderer = this.renderers.pop();
			renderer?.dispose();
		}

		// Remove excess DOM children
		while (this.gridEl.children.length > count) {
			this.gridEl.lastElementChild?.remove();
		}

		// Add missing renderers
		while (this.renderers.length < count) {
			const itemEl = this.gridEl.createDiv({ cls: 'bases-charts-plot-grid-item' });
			const renderer = new ChartRenderer(itemEl, this.view);
			this.renderers.push(renderer);
		}
	}

	destroy(): void {
		for (const renderer of this.renderers) {
			renderer.dispose();
		}
		this.renderers = [];
		this.legendEl.remove();
		this.gridEl.remove();
	}
}
