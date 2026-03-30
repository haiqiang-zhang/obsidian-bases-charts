import type { BasesPropertyId } from 'obsidian';
import { displayTooltip, setIcon } from 'obsidian';
import type { ChartView, ChartViewType } from './chartView';
import { AggregateMode, aggregateKey, LINE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from './chartView';

let lastClickedPropId: BasesPropertyId | null = null;

function getPropertyPrefix(item: HTMLElement): string {
	const iconEl = item.querySelector('.bases-toolbar-menu-item-info-icon svg');
	if (iconEl?.classList.contains('lucide-info')) return 'file.';
	if (iconEl?.classList.contains('lucide-square-function')) return 'formula.';
	return 'note.';
}

function resolvePropertyId(view: ChartView, displayName: string, prefix: string): BasesPropertyId | null {
	return view.allProperties.find(id => {
		const idStr = id.toString();
		return idStr.startsWith(prefix) && view.config.getDisplayName(id) === displayName;
	}) ?? null;
}

export function removeInjectedDOM(): void {
	document.querySelectorAll('.bases-chart-aggregate-row, .bases-chart-help-icon').forEach(el => el.remove());
	lastClickedPropId = null;
}

export function getSettingTooltips(type: ChartViewType): Record<string, string> {
	if (type === LINE_CHART_VIEW_TYPE) {
		return {
			'Gap handling': 'Only applies when the X axis is categorical (e.g. text properties). When data is grouped, some groups may not have values at every X position. "Leave gap" skips the missing points, while "Fill with 0" treats them as zero.',
		};
	}
	return {};
}

export function injectHelpIcons(container: HTMLElement, tooltips: Record<string, string>): void {
	const labels = Array.from(container.querySelectorAll<HTMLElement>('.input-row-label'));
	for (const label of labels) {
		if (label.querySelector('.bases-chart-help-icon')) continue;

		const displayName = label.textContent?.trim();
		if (!displayName) continue;

		const tooltipText = Object.entries(tooltips).find(([name]) => name === displayName)?.[1];
		if (!tooltipText) continue;

		const icon = label.createEl('span', { cls: 'bases-chart-help-icon' });
		setIcon(icon, 'lucide-help-circle');
		const svg = icon.querySelector('svg');
		if (svg) {
			svg.setAttribute('width', '14');
			svg.setAttribute('height', '14');
		}
		icon.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			displayTooltip(icon, tooltipText, { placement: 'top' });
		});
	}
}

export function trackPropertyChevrons(view: ChartView, menu: HTMLElement): void {
	const items = Array.from(menu.querySelectorAll<HTMLElement>('.bases-toolbar-menu-item'));
	for (const item of items) {
		const chevron = item.querySelector('.bases-toolbar-menu-item-icon');
		if (!chevron || chevron.hasAttribute('data-chart-tracked')) continue;
		chevron.setAttribute('data-chart-tracked', 'true');
		chevron.addEventListener('mousedown', () => {
			const name = item.querySelector('.bases-toolbar-menu-item-name')?.textContent?.trim();
			if (!name) return;
			const prefix = getPropertyPrefix(item);
			lastClickedPropId = resolvePropertyId(view, name, prefix);
		});
	}
}

export function renameToolbarButton(containerEl: HTMLElement): void {
	const container = containerEl.parentElement;
	if (!container) return;
	const label = container.querySelector('.bases-toolbar-properties-menu .text-button-label');
	if (label) {
		label.textContent = 'Y axes';
	}
}

export function restoreToolbarButton(containerEl: HTMLElement): void {
	const container = containerEl.parentElement;
	if (!container) return;
	const label = container.querySelector('.bases-toolbar-properties-menu .text-button-label');
	if (label) {
		label.textContent = 'Properties';
	}
}

export function injectAggregateDropdown(view: ChartView, form: HTMLElement): void {
	if (form.querySelector('.bases-chart-aggregate-row')) return;
	if (!lastClickedPropId) return;

	// Only inject into property edit forms, not the view config form
	const backLabel = form.closest('.bases-toolbar-menu-container')?.querySelector('.back-label')?.textContent?.trim();
	if (!backLabel?.startsWith('Edit ')) return;

	const propId = lastClickedPropId;

	const row = form.createDiv({ cls: 'input-row bases-chart-aggregate-row' });
	row.createDiv({ cls: 'input-row-label', text: 'Aggregate' });
	const content = row.createDiv({ cls: 'input-row-content' });

	const select = content.createEl('select', { cls: 'dropdown' });
	const includeNone = view.type === SCATTER_CHART_VIEW_TYPE;
	const options = includeNone
		? [AggregateMode.NONE, AggregateMode.SUM, AggregateMode.AVERAGE, AggregateMode.COUNT, AggregateMode.MIN, AggregateMode.MAX]
		: [AggregateMode.SUM, AggregateMode.AVERAGE, AggregateMode.COUNT, AggregateMode.MIN, AggregateMode.MAX];

	for (const opt of options) {
		select.createEl('option', { value: opt, text: opt });
	}

	const currentMode = view.getAggregateModeForProperty(propId);
	select.value = currentMode;

	select.addEventListener('change', () => {
		view.config.set(aggregateKey(propId), select.value);
		view.events.trigger('data-updated');
	});
}
