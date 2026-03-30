import { displayTooltip, setIcon } from 'obsidian';
import type { ChartView, ChartViewType } from './chartView';
import { AggregateMode, aggregateKey, COMMON_SETTINGS, LINE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from './chartView';

export function removeInjectedDOM(): void {
	document.querySelectorAll('.bases-chart-y-axis-settings, .bases-chart-aggregate-row, .bases-chart-help-icon').forEach(el => el.remove());
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
		icon.style.cursor = 'pointer';
		icon.style.marginLeft = '4px';
		icon.style.display = 'inline-flex';
		icon.style.verticalAlign = 'middle';
		icon.style.opacity = '0.5';
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

export function injectYAxisSettings(view: ChartView, menu: HTMLElement): void {
	if (menu.querySelector('.bases-chart-y-axis-settings')) return;

	const settingsEl = menu.createDiv({ cls: 'bases-chart-y-axis-settings' });
	settingsEl.style.padding = '8px 12px';
	settingsEl.style.borderTop = '1px solid var(--background-modifier-border)';
	settingsEl.style.fontSize = 'var(--font-ui-small)';
	settingsEl.style.display = 'flex';
	settingsEl.style.flexDirection = 'column';
	settingsEl.style.gap = '8px';
	settingsEl.style.flexShrink = '0';

	// Sync across charts
	const syncRow = settingsEl.createDiv({ cls: 'input-row' });
	syncRow.createDiv({ cls: 'input-row-label', text: 'Sync across charts' });
	const syncContent = syncRow.createDiv({ cls: 'input-row-content' });
	const syncLabel = syncContent.createEl('label', { cls: `checkbox-container${view.config.get(COMMON_SETTINGS.SYNC_Y_AXES) ? ' is-enabled' : ''}` });
	syncLabel.tabIndex = 0;
	const syncCheckbox = syncLabel.createEl('input', { type: 'checkbox' });
	syncCheckbox.tabIndex = 0;
	syncCheckbox.checked = Boolean(view.config.get(COMMON_SETTINGS.SYNC_Y_AXES));
	syncCheckbox.addEventListener('change', () => {
		view.config.set(COMMON_SETTINGS.SYNC_Y_AXES, syncCheckbox.checked);
		syncLabel.toggleClass('is-enabled', syncCheckbox.checked);
		view.events.trigger('data-updated');
	});

	// Min Y override
	const minRow = settingsEl.createDiv({ cls: 'input-row' });
	minRow.createDiv({ cls: 'input-row-label', text: 'Min Y override' });
	const minContent = minRow.createDiv({ cls: 'input-row-content' });
	const minInput = minContent.createEl('input', { type: 'text', placeholder: 'Leave empty to disable' });
	minInput.value = (view.config.get(COMMON_SETTINGS.MIN_Y_OVERRIDE) as string) ?? '';
	minInput.addEventListener('change', () => {
		view.config.set(COMMON_SETTINGS.MIN_Y_OVERRIDE, minInput.value || null);
		view.events.trigger('data-updated');
	});

	// Max Y override
	const maxRow = settingsEl.createDiv({ cls: 'input-row' });
	maxRow.createDiv({ cls: 'input-row-label', text: 'Max Y override' });
	const maxContent = maxRow.createDiv({ cls: 'input-row-content' });
	const maxInput = maxContent.createEl('input', { type: 'text', placeholder: 'Leave empty to disable' });
	maxInput.value = (view.config.get(COMMON_SETTINGS.MAX_Y_OVERRIDE) as string) ?? '';
	maxInput.addEventListener('change', () => {
		view.config.set(COMMON_SETTINGS.MAX_Y_OVERRIDE, maxInput.value || null);
		view.events.trigger('data-updated');
	});
}

export function renameToolbarButton(containerEl: HTMLElement): void {
	const container = containerEl.parentElement;
	if (!container) return;
	const label = container.querySelector('.bases-toolbar-properties-menu .text-button-label');
	if (label) {
		label.textContent = 'Y axis';
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

	const header = form.closest('.bases-toolbar-menu-container')?.querySelector('.back-label');
	const headerText = header?.textContent?.trim();
	if (!headerText?.startsWith('Edit ')) return;
	const displayName = headerText.slice('Edit '.length);

	const propertyOrder = view.config.getOrder();
	const propId = propertyOrder.find(id => view.config.getDisplayName(id) === displayName);
	if (!propId) return;

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
