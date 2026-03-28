import type { EChartsOption } from 'echarts';
import type { DataWrapper } from 'src/ChartData';
import type { ChartView, ChartViewType } from 'src/ChartView';
import { BAR_CHART_VIEW_TYPE, CHART_SETTINGS, LINE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from 'src/ChartView';
import { ChartRenderer } from 'src/charts/ChartRenderer';
import type { ResolvedColors } from 'src/charts/echarts-setup';
import { buildBarOption } from 'src/charts/options/bar-options';
import { buildLineOption } from 'src/charts/options/line-options';
import { buildScatterOption } from 'src/charts/options/scatter-options';
import { OBSIDIAN_COLOR_PALETTE } from 'src/utils/utils';

export class ChartLayout {
	private renderers: ChartRenderer[] = [];
	private legendEl: HTMLElement;
	private gridEl: HTMLElement;

	constructor(
		private view: ChartView,
		private scrollEl: HTMLElement,
	) {
		this.legendEl = scrollEl.createDiv({ cls: 'bases-charts-plot-legend' });
		this.gridEl = scrollEl.createDiv({ cls: 'bases-charts-plot-grid' });

		view.events.on('data-updated', () => this.update());
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
			const yLabel = this.view.getYAxisLabel(data.getChartName(i));
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
			return buildScatterOption(data, chartIndex, xName, yLabel, isGrouped, colors);
		} else if (type === LINE_CHART_VIEW_TYPE) {
			return buildLineOption(data, chartIndex, xName, yLabel, isGrouped, colors);
		} else if (type === BAR_CHART_VIEW_TYPE) {
			const showLabels = Boolean(this.view.config.get(CHART_SETTINGS.SHOW_LABELS) ?? true);
			const showPercentages = Boolean(this.view.config.get(CHART_SETTINGS.SHOW_PERCENTAGES) ?? false);
			const hasDomainOverride = this.view.hasDomainOverride();
			const hasUserSort = this.view.config.getSort().length > 0;
			return buildBarOption(data, chartIndex, xName, yLabel, isGrouped, colors, showLabels, showPercentages, hasDomainOverride, hasUserSort);
		}

		return {};
	}

	private renderLegend(data: DataWrapper): void {
		this.legendEl.empty();
		const groupIds = data.getGroupIdentifiers();
		if (groupIds.length <= 1) return;

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
