import type { EChartsOption } from 'echarts';
import { debounce } from 'obsidian';
import type { DataWrapper } from '../ChartData';
import type { ChartView } from '../ChartView';
import { AggregateMode, BAR_CHART_VIEW_TYPE, CHART_SETTINGS, LINE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from '../ChartView';
import { ChartRenderer } from './ChartRenderer';
import type { ResolvedColors } from './echarts-setup';
import { buildBarOption } from './options/bar-options';
import { buildLineOption } from './options/line-options';
import { buildScatterOption } from './options/scatter-options';
import { OBSIDIAN_COLOR_PALETTE } from '../utils/utils';

export class ChartLayout {
	private renderers: ChartRenderer[] = [];
	private legendEl: HTMLElement;
	private gridEl: HTMLElement;
	private debouncedUpdate = debounce(() => this.update(), 50, true);

	constructor(
		private view: ChartView,
		private scrollEl: HTMLElement,
	) {
		this.legendEl = scrollEl.createDiv({ cls: 'bases-charts-plot-legend' });
		this.gridEl = scrollEl.createDiv({ cls: 'bases-charts-plot-grid' });

		view.events.on('data-updated', () => this.debouncedUpdate());
	}

	update(): void {
		const data = this.view.processData();
		const chartIds = data.getChartIdentifiers();

		this.renderLegend(data);
		this.reconcileRenderers(chartIds.length);

		const xField = this.view.config.getAsPropertyId(CHART_SETTINGS.X);
		const xName = xField ? `${this.view.config.getDisplayName(xField)} →` : '';

		for (let i = 0; i < chartIds.length; i++) {
			const renderer = this.renderers[i];
			const isGrouped = data.hasMultipleGroups();
			const chartData = data.getFlat(i);

			if (chartData.length === 0) {
				renderer.showMessage(
					'Non-numeric properties require Count aggregate.',
					{
						label: 'Use Count',
						onClick: () => {
							this.view.config.set(CHART_SETTINGS.AGGREGATE, AggregateMode.COUNT);
						},
					},
				);
				continue;
			}

			const hasNonNumeric = chartData.some(d => !d.isNumeric);
			const yLabel = hasNonNumeric
				? `↑ ${data.getChartName(i)} (Count)`
				: this.view.getYAxisLabel(data.getChartName(i));
			const option = this.buildOption(data, i, xName, yLabel, isGrouped, renderer.colors);
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
			const isNoneAggregate = this.view.getAggregateMode() === AggregateMode.NONE;
			return buildScatterOption(data, chartIndex, xName, yLabel, isGrouped, colors, isNoneAggregate);
		} else if (type === LINE_CHART_VIEW_TYPE) {
			const nullHandling = (this.view.config.get(CHART_SETTINGS.NULL_HANDLING) as string) ?? 'Skip';
			const treatNullAsZero = nullHandling === 'Treat as 0';
			return buildLineOption(data, chartIndex, xName, yLabel, isGrouped, colors, treatNullAsZero);
		} else if (type === BAR_CHART_VIEW_TYPE) {
			const showLabels = Boolean(this.view.config.get(CHART_SETTINGS.SHOW_LABELS) ?? true);
			const showPercentages = Boolean(this.view.config.get(CHART_SETTINGS.SHOW_PERCENTAGES) ?? false);
			const hasDomainOverride = this.view.hasDomainOverride();
			return buildBarOption(data, chartIndex, xName, yLabel, isGrouped, colors, showLabels, showPercentages, hasDomainOverride);
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
