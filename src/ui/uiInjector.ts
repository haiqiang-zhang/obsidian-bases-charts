const AI_CHART_HIDDEN_TOOLBAR_SELECTORS = [
	'.bases-toolbar-sort-menu',
	'.bases-toolbar-group-menu',
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
