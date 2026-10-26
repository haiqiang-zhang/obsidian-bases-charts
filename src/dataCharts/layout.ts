import { debounce } from 'obsidian';
import type { EventRef } from 'obsidian';
import type { DataWrapper } from './data';
import type { DataChartView } from './dataChartView';
import { AggregateMode, aggregateKey } from './aggregate';
import { COMMON_SETTINGS } from './types';
import { ChartRenderer } from '../utils/renderer';
import { resolveColors } from '../ui/colors';
import { getChartStyle } from '../ui/chartStyle';

export class ChartLayout {
	private renderers: ChartRenderer[] = [];
	private legendEl: HTMLElement;
	private gridEl: HTMLElement;
	private previewEl: HTMLElement;
	private emptyEl: HTMLElement;
	private debouncedUpdate = debounce(() => this.update(), 50, true);
	private updateRef: EventRef;

	constructor(
		private view: DataChartView,
		private containerEl: HTMLElement,
	) {
		this.gridEl = containerEl.createDiv({ cls: 'bases-charts-plot-grid' });
		this.previewEl = containerEl.createDiv({ cls: 'bases-chart-touch-preview' });
		this.previewEl.setAttribute('role', 'region');
		this.previewEl.setAttribute('aria-label', 'Selected chart data');
		this.legendEl = containerEl.createDiv({ cls: 'bases-charts-plot-legend' });
		this.legendEl.toggleClass('is-line-chart', ['chart-line', 'chart-area', 'chart-radar'].includes(view.type));
		this.emptyEl = containerEl.createDiv({ cls: 'bases-chart-empty-state bases-charts-hidden' });

		this.updateRef = view.events.on('data-updated', () => this.debouncedUpdate());
	}

	update(): void {
		// Theme changes can arrive before Bases assigns the first query result.
		if (!this.view.config || !this.view.data) return;

		const xField = this.view.config.getAsPropertyId(COMMON_SETTINGS.X);
		const propertyOrder = this.view.getYProperties();
		this.emptyEl.empty();
		const needsAxis = !xField || propertyOrder.length === 0;
		this.emptyEl.toggleClass('bases-charts-hidden', !needsAxis);
		this.gridEl.toggleClass('bases-charts-hidden', needsAxis);
		this.previewEl.toggleClass('bases-charts-hidden', needsAxis);
		if (needsAxis) {
			this.legendEl.empty();
			this.legendEl.addClass('bases-charts-hidden');
			this.reconcileRenderers(0);
			const axis = !xField ? 'x' : 'y';
			const radial = ['chart-pie', 'chart-radar'].includes(this.view.type);
			this.emptyEl.createDiv({ text: !xField
				? `Choose ${radial ? 'a category' : 'an X axis'} to start your chart.`
				: `Add ${radial ? 'a value property' : 'a Y axis'} to show values.` });
			const button = this.emptyEl.createEl('button', { text: !xField
				? `Choose ${radial ? 'category' : 'X axis'}` : `Add ${radial ? 'values' : 'Y axis'}` });
			button.addEventListener('click', () => this.view.openAxisSettings(axis));
			return;
		}
		const data = this.view.processData();
		const chartCount = this.view.getChartCount(data);

		const colors = resolveColors(this.containerEl, this.view.config.get(COMMON_SETTINGS.COLOR_PALETTE));
		const fontFamily = getChartStyle(this.containerEl).fontFamily;
		this.renderLegend(data, colors.palette);
		this.reconcileRenderers(chartCount);

		const xName = xField ? this.view.config.getDisplayName(xField) : '';

		for (let i = 0; i < chartCount; i++) {
			const renderer = this.renderers[i];
			const isGrouped = data.hasMultipleGroups();
			const chartData = this.view.getChartData(data, i);
			const propId = propertyOrder[i];

			if (chartData.length === 0) {
				renderer.showMessage(
					this.view.data.groupedData.every(group => group.entries.length === 0)
						? 'No entries in the selected groups.'
						: 'No numeric values. Use Count for text properties.',
					propId && this.view.data.groupedData.some(group => group.entries.length > 0) ? {
						label: 'Use Count',
						onClick: () => {
							this.view.config.set(aggregateKey(propId), AggregateMode.COUNT);
						},
					} : undefined,
				);
				continue;
			}

			const message = this.view.getChartMessage(data, i);
			if (message) {
				renderer.showMessage(message);
				continue;
			}
			const yLabel = this.view.getChartLabel(data, i);
			const option = this.view.buildOption(data, i, xName, yLabel, isGrouped, colors);
			renderer.setOption({ ...option, textStyle: { fontFamily, ...option.textStyle } }, {
				xName: this.view.config.getDisplayName(xField),
				yLabel,
				groupNames: data.getGroupIdentifiers().map((_, index) => data.getGroupName(index)),
				chartType: this.view.type,
				showPercentages: Boolean(this.view.config.get('show-percentages')),
			});
		}
	}

	private renderLegend(data: DataWrapper, palette: string[]): void {
		this.legendEl.empty();
		const entries = this.view.getChartLegend(data);
		if (entries.length === 0) {
			this.legendEl.addClass('bases-charts-hidden');
			return;
		}
		this.legendEl.removeClass('bases-charts-hidden');

		for (const entry of entries) {
			const itemEl = this.legendEl.createDiv({ cls: 'bases-charts-plot-legend-item' });
			const colorEl = itemEl.createDiv({ cls: 'bases-charts-plot-legend-color' });
			colorEl.style.setProperty('--color', palette[entry.colorIndex % palette.length]);
			itemEl.createSpan({ cls: 'bases-charts-plot-legend-label', text: entry.name, attr: { title: entry.name } });
		}
	}

	private reconcileRenderers(count: number): void {
		while (this.renderers.length > count) {
			const renderer = this.renderers.pop();
			renderer?.dispose();
		}

		while (this.gridEl.children.length > count) {
			this.gridEl.lastElementChild?.remove();
		}

		while (this.renderers.length < count) {
			const itemEl = this.gridEl.createDiv({ cls: 'bases-charts-plot-grid-item' });
			const renderer = new ChartRenderer(itemEl, this.view, this.previewEl);
			this.renderers.push(renderer);
		}
	}

	destroy(): void {
		this.view.events.offref(this.updateRef);
		this.debouncedUpdate.cancel();
		for (const renderer of this.renderers) {
			renderer.dispose();
		}
		this.renderers = [];
		this.legendEl.remove();
		this.gridEl.remove();
		this.previewEl.remove();
		this.emptyEl.remove();
	}
}
