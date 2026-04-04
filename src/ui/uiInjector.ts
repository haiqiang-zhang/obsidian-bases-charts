import type { BasesPropertyId } from 'obsidian';
import { displayTooltip, setIcon } from 'obsidian';
import { AggregateMode, aggregateKey } from '../dataCharts/aggregate';
import type { DataChartView } from '../dataCharts/dataChartView';

let lastClickedPropId: BasesPropertyId | null = null;

function getPropertyPrefix(item: HTMLElement): string {
	const iconEl = item.querySelector('.bases-toolbar-menu-item-info-icon svg');
	if (iconEl?.classList.contains('lucide-info')) return 'file.';
	if (iconEl?.classList.contains('lucide-square-function')) return 'formula.';
	return 'note.';
}

function resolvePropertyId(view: DataChartView, displayName: string, prefix: string): BasesPropertyId | null {
	return view.allProperties.find(id => {
		const idStr = id.toString();
		return idStr.startsWith(prefix) && view.config.getDisplayName(id) === displayName;
	}) ?? null;
}

export function removeInjectedDOM(): void {
	document.querySelectorAll('.bases-chart-aggregate-row, .bases-chart-help-icon').forEach(el => el.remove());
	lastClickedPropId = null;
}

export function injectYAxesHint(configMenu: HTMLElement): void {
	if (configMenu.querySelector('.bases-chart-y-axes-hint')) return;

	// Find our Y axes group by checking for group header + our unique setting
	const containers = Array.from(configMenu.querySelectorAll<HTMLElement>('.input-group-container'));
	const container = containers.find(c => {
		const header = c.querySelector('.input-group-header-text')?.textContent?.trim();
		const labels = Array.from(c.querySelectorAll('.input-row-label')).map(l => l.textContent?.trim());
		return header === 'Y axes' && labels.includes('Sync across charts');
	});
	if (!container) return;

	const content = container.querySelector('.input-group-content');
	if (!content) return;

	const hint = content.createDiv({ cls: 'bases-chart-y-axes-hint' });
	hint.textContent = 'Set y axes and per-property aggregate using the toolbar button in chart view';
}

export function getSettingTooltips(type: string): Record<string, string> {
	if (type === 'chart-line') {
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
			displayTooltip(icon, tooltipText, { placement: 'right' });
		});
	}
}

export function trackPropertyChevrons(view: DataChartView, menu: HTMLElement): void {
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

const AI_CHART_HIDDEN_TOOLBAR_SELECTORS = [
	'.bases-toolbar-sort-menu',
	'.bases-toolbar-filter-menu',
	'.bases-toolbar-properties-menu',
	'.bases-toolbar-search',
];

export function hideAiChartToolbarButtons(containerEl: HTMLElement): void {
	const toolbar = containerEl.parentElement?.querySelector('.bases-toolbar');
	if (!toolbar) return;
	for (const sel of AI_CHART_HIDDEN_TOOLBAR_SELECTORS) {
		toolbar.querySelector<HTMLElement>(sel)?.hide();
	}
}

export function showAiChartToolbarButtons(containerEl: HTMLElement): void {
	const toolbar = containerEl.parentElement?.querySelector('.bases-toolbar');
	if (!toolbar) return;
	for (const sel of AI_CHART_HIDDEN_TOOLBAR_SELECTORS) {
		toolbar.querySelector<HTMLElement>(sel)?.show();
	}
}

export function injectAggregateDropdown(view: DataChartView, form: HTMLElement): void {
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
	const includeNone = view.type === 'chart-scatter';
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
