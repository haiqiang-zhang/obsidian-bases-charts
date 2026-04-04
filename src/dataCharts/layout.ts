import { debounce } from 'obsidian';
import type { DataWrapper } from './data';
import type { DataChartView } from './dataChartView';
import { AggregateMode, aggregateKey } from './aggregate';
import { COMMON_SETTINGS } from './types';
import { ChartRenderer } from '../utils/renderer';
import { resolveColors } from '../ui/colors';
import { OBSIDIAN_COLOR_PALETTE } from '../ui/colors';

export class ChartLayout {
	private renderers: ChartRenderer[] = [];
	private legendEl: HTMLElement;
	private gridEl: HTMLElement;
	private debouncedUpdate = debounce(() => this.update(), 50, true);

	constructor(
		private view: DataChartView,
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
			const option = this.view.buildOption(data, i, xName, yLabel, isGrouped, colors);
			renderer.setOption(option);
		}
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
		while (this.renderers.length > count) {
			const renderer = this.renderers.pop();
			renderer?.dispose();
		}

		while (this.gridEl.children.length > count) {
			this.gridEl.lastElementChild?.remove();
		}

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
