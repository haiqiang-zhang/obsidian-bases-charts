import { Component, DropdownComponent, Menu, SearchComponent, setIcon } from 'obsidian';
import type { DataChartView } from '../dataCharts/dataChartView';
import { AggregateMode, aggregateKey } from '../dataCharts/aggregate';
import { COMMON_SETTINGS } from '../dataCharts/types';
import { parseValueAsNumber } from '../utils/utils';
import { DATE_GROUPING_OPTIONS, normalizeDateGrouping } from '../dataCharts/dateBuckets';

type Axis = 'x' | 'y';

/** The only DOM adapter for the native toolbar; all settings use BasesViewConfig. */
export class ChartToolbar extends Component {
	private toolbar: HTMLElement | null = null;
	private fallback: HTMLElement | null = null;
	private buttons = new Map<Axis, HTMLButtonElement>();
	private items: HTMLElement[] = [];
	private panel: HTMLElement | null = null;
	private closePanel: (() => void) | null = null;
	private dateGroupingMenu: Menu | null = null;
	private dateGroupingTrigger: HTMLButtonElement | null = null;
	private dateGroupingDismissals = new WeakMap<Event, HTMLButtonElement>();

	constructor(private view: DataChartView) {
		super();
	}

	onload(): void {
		this.update();
		this.registerEvent(this.view.events.on('data-updated', () => this.update()));
	}

	openAxis(axis: Axis): void {
		const button = this.buttons.get(axis);
		if (button) this.openPanel(axis, button);
	}

	private axisLabel(axis: Axis): string {
		if (['chart-pie', 'chart-radar'].includes(this.view.type)) return axis === 'x' ? 'Category' : 'Values';
		return axis === 'x' ? 'X axis' : 'Y axes';
	}

	update(): void {
		// Bases assigns config after loading the view, before onDataUpdated.
		if (!this.view.config) return;
		const parent = this.view.containerEl.parentElement;
		const nativeToolbar = parent?.querySelector<HTMLElement>(':scope > .bases-header .bases-toolbar');
		if ((nativeToolbar && nativeToolbar !== this.toolbar) || !this.toolbar) {
			this.detach();
			const toolbar = nativeToolbar ?? this.view.containerEl.createDiv({ cls: 'bases-chart-fallback-toolbar' });
			if (!nativeToolbar) this.fallback = toolbar;
			this.toolbar = toolbar;
			toolbar.addClass('bases-chart-toolbar');
			for (const axis of ['x', 'y'] as const) {
				const item = toolbar.createDiv({ cls: `bases-toolbar-item bases-chart-${axis}-menu` });
				const button = item.createEl('button', { cls: 'text-icon-button bases-chart-axis-button' });
				button.type = 'button';
				button.setAttribute('aria-haspopup', 'dialog');
				button.setAttribute('aria-expanded', 'false');
				const icon = ['chart-pie', 'chart-radar'].includes(this.view.type)
					? (axis === 'x' ? 'list' : 'sigma')
					: (axis === 'x' ? 'move-horizontal' : 'move-vertical');
				setIcon(button.createSpan({ cls: 'text-button-icon' }), icon);
				button.createSpan({ cls: 'text-button-label', text: this.axisLabel(axis) });
				button.createSpan({ cls: 'bases-chart-axis-summary' });
				button.addEventListener('click', () => this.openPanel(axis, button));
				this.buttons.set(axis, button);
				this.items.push(item);
			}
		}
		const x = this.view.config.getAsPropertyId(COMMON_SETTINGS.X);
		const y = this.view.getYProperties();
		const grouping = this.view.getXDateGrouping();
		const xSummary = x ? `${this.view.config.getDisplayName(x)}${grouping === 'exact' ? '' : ` · ${DATE_GROUPING_OPTIONS[grouping]}`}` : 'Choose';
		this.updateButton('x', xSummary, x ? `${this.axisLabel('x')}: ${xSummary}` : `Choose ${this.axisLabel('x')}`);
		this.updateButton('y', String(y.length), `${this.axisLabel('y')}: ${y.length} selected`);
		for (const row of Array.from(this.panel?.querySelectorAll<HTMLElement>('.bases-chart-selected-property') ?? [])) {
			const id = row.dataset.property;
			const select = row.querySelector<HTMLSelectElement>('.bases-chart-aggregate-select');
			if (id && select) select.value = this.view.getAggregateModeForProperty(id as import('obsidian').BasesPropertyId);
		}
	}

	private updateButton(axis: Axis, summary: string, label: string): void {
		const button = this.buttons.get(axis);
		const el = button?.querySelector<HTMLElement>('.bases-chart-axis-summary');
		if (el) el.textContent = summary;
		button?.setAttribute('aria-label', label);
		button?.setAttribute('title', label);
	}

	private openPanel(axis: Axis, button: HTMLButtonElement): void {
		const alreadyOpen = button.getAttribute('aria-expanded') === 'true';
		this.closePanel?.();
		if (alreadyOpen) return;
		const doc = button.ownerDocument;
		const win = doc.defaultView;
		if (!win) return;
		const panel = doc.body.createDiv({ cls: 'bases-chart-axis-panel' });
		this.panel = panel;
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', this.axisLabel(axis));
		button.setAttribute('aria-expanded', 'true');
		const header = panel.createDiv({ cls: 'bases-chart-panel-header' });
		header.createDiv({ cls: 'bases-chart-panel-title', text: this.axisLabel(axis) });
		this.iconButton(header, 'x', 'Close', () => {
			this.closePanel?.();
			button.focus();
		});
		const selection = panel.createDiv({ cls: 'bases-chart-selection' });
		const selectionHeading = selection.createDiv({ cls: 'bases-chart-selection-heading' });
		selectionHeading.createSpan({ text: axis === 'x' ? 'Selected property' : 'Selected properties' });
		const count = axis === 'y' ? selectionHeading.createSpan({ cls: 'flair bases-chart-selection-count' }) : null;
		const selected = selection.createDiv({ cls: 'bases-chart-selected-properties' });
		const searchContainer = panel.createDiv({ cls: 'bases-chart-property-search' });
		const searchComponent = new SearchComponent(searchContainer).setPlaceholder('Find a property…');
		const search = searchComponent.inputEl;
		search.setAttribute('aria-label', 'Find a property');
		const results = panel.createDiv({ cls: 'bases-chart-property-results' });
		const footer = panel.createDiv({ cls: 'bases-chart-panel-footer' });
		const formula = footer.createEl('button', { cls: 'bases-chart-add-formula', attr: { type: 'button' } });
		setIcon(formula.createSpan({ cls: 'bases-chart-property-icon' }), 'square-function');
		formula.createSpan({ text: 'Add formula' });
		formula.disabled = !this.view.canEditFormulas();
		if (formula.disabled) formula.title = 'The native formula editor is unavailable in this Obsidian version.';
		formula.addEventListener('click', () => this.openEditor(axis));

		const render = () => {
			if (axis === 'x') this.renderSelectedX(selected);
			else this.renderSelected(selected, render);
			if (count) count.setText(String(this.view.getYProperties().length));
			this.renderProperties(results, axis, search.value, render);
		};
		searchComponent.onChange(render);
		render();

		const rect = button.getBoundingClientRect();
		const width = Math.max(0, Math.min(420, win.innerWidth - 16));
		panel.style.setProperty('--chart-panel-width', `${width}px`);
		panel.style.setProperty('--chart-panel-left', `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`);
		const below = win.innerHeight - rect.bottom - 14;
		if (Math.max(below, rect.top - 14) < 240) {
			panel.addClass('is-short-window');
			panel.style.setProperty('--chart-panel-height', `${Math.max(0, win.innerHeight - 16)}px`);
		} else if (below >= 240 || rect.top < below) {
			panel.style.setProperty('--chart-panel-top', `${rect.bottom + 6}px`);
			panel.style.setProperty('--chart-panel-height', `${Math.max(0, below)}px`);
		} else {
			panel.style.setProperty('--chart-panel-bottom', `${win.innerHeight - rect.top + 6}px`);
			panel.style.setProperty('--chart-panel-height', `${Math.max(0, rect.top - 14)}px`);
		}

		const onOutside = (event: PointerEvent) => {
			const path = event.composedPath();
			// Public Menu mounts under body, outside this panel's event path.
			if (this.dateGroupingMenu && path.some(target => (target as Element).classList?.contains('menu'))) return;
			if (!path.includes(panel) && !path.includes(button)) this.closePanel?.();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (event.defaultPrevented) return;
				event.preventDefault();
				event.stopPropagation();
				// The native keymap can hide Menu earlier in this same key dispatch.
				const dismissedTrigger = this.dateGroupingDismissals.get(event);
				if (dismissedTrigger) {
					this.dateGroupingDismissals.delete(event);
					event.stopImmediatePropagation();
					dismissedTrigger.focus();
					return;
				}
				if (this.dateGroupingMenu) {
					event.stopImmediatePropagation();
					this.closeDateGroupingMenu(true);
					return;
				}
				this.closePanel?.();
				button.focus();
			}
			if (this.dateGroupingMenu) return;
			if (event.key === 'ArrowDown' && event.target === search) {
				event.preventDefault();
				results.querySelector<HTMLButtonElement>('.bases-chart-property-option')?.focus();
			}
			if (event.composedPath().includes(results)
				&& ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
				const options = Array.from(results.querySelectorAll<HTMLButtonElement>('.bases-chart-property-option'));
				const index = options.indexOf(event.target as HTMLButtonElement);
				if (index < 0) return;
				const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
					: index + (event.key === 'ArrowDown' ? 1 : -1);
				event.preventDefault();
				if (next < 0) search.focus();
				else options[Math.min(next, options.length - 1)]?.focus();
			}
		};
		const onResize = () => this.closePanel?.();
		const onFocus = (event: FocusEvent) => {
			if (this.dateGroupingMenu) return;
			if (!event.composedPath().includes(panel) && event.target !== button) this.closePanel?.();
		};
		doc.addEventListener('pointerdown', onOutside, true);
		doc.addEventListener('keydown', onKey, true);
		doc.addEventListener('focusin', onFocus);
		win.addEventListener('resize', onResize);
		this.closePanel = () => {
			doc.removeEventListener('pointerdown', onOutside, true);
			doc.removeEventListener('keydown', onKey, true);
			doc.removeEventListener('focusin', onFocus);
			win.removeEventListener('resize', onResize);
			this.closeDateGroupingMenu();
			panel.remove();
			button.setAttribute('aria-expanded', 'false');
			this.panel = null;
			this.closePanel = null;
		};
		search.focus();
	}

	private propertyIcon(id: string): string {
		if (id.startsWith('formula.')) return 'square-function';
		if (id === this.view.config.getAsPropertyId(COMMON_SETTINGS.X) && this.view.isDateXAxis()) return 'calendar-days';
		return id.startsWith('file.') ? 'file' : 'hash';
	}

	private openEditor(axis: Axis, propertyId?: import('obsidian').BasesPropertyId): void {
		const anchor = this.buttons.get(axis);
		if (!anchor) return;
		this.closePanel?.();
		this.view.openFormulaEditor(anchor, axis, propertyId);
	}

	private propertyEditButton(parent: HTMLElement, axis: Axis, propertyId: import('obsidian').BasesPropertyId): void {
		if (!this.view.canEditFormulas()) return;
		const name = this.view.config.getDisplayName(propertyId);
		const kind = propertyId.startsWith('formula.') ? 'formula' : 'property';
		const button = this.iconButton(parent, 'chevron-right', `Edit ${kind}: ${name}`, () => this.openEditor(axis, propertyId));
		button.addClass('bases-chart-property-edit');
		button.setAttribute('aria-haspopup', 'dialog');
	}

	private openDateGroupingMenu(button: HTMLButtonElement): void {
		const panel = this.panel;
		if (!panel) return;
		if (this.dateGroupingMenu) {
			this.closeDateGroupingMenu(true);
			return;
		}
		const menu = new Menu().setUseNativeMenu(false).setParentElement(panel);
		const current = this.view.getXDateGrouping();
		for (const [unit, label] of Object.entries(DATE_GROUPING_OPTIONS)) {
			menu.addItem(item => item.setTitle(label).setChecked(unit === current).onClick(() => {
				if (this.panel !== panel) return;
				this.view.setXDateGrouping(normalizeDateGrouping(unit));
				button.setText(label);
				this.changed();
				this.closeDateGroupingMenu(true);
			}));
		}
		menu.onHide(() => {
			button.setAttribute('aria-expanded', 'false');
			if (this.dateGroupingMenu === menu) {
				this.dateGroupingMenu = null;
				this.dateGroupingTrigger = null;
				// Native Menu hides from the window keymap without cancelling Escape.
				// Track only that exact dispatch so later key presses remain independent.
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- Menu.onHide has no event; Electron exposes the current dispatch here without a timing heuristic.
				const event = button.ownerDocument.defaultView?.event;
				if (event?.type === 'keydown' && 'key' in event && event.key === 'Escape') {
					this.dateGroupingDismissals.set(event, button);
				}
			}
		});
		this.dateGroupingMenu = menu;
		this.dateGroupingTrigger = button;
		button.setAttribute('aria-expanded', 'true');
		const rect = button.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4, width: rect.width, overlap: true, left: true }, button.ownerDocument);
	}

	private closeDateGroupingMenu(restoreFocus = false): void {
		const menu = this.dateGroupingMenu;
		const trigger = this.dateGroupingTrigger;
		this.dateGroupingMenu = null;
		this.dateGroupingTrigger = null;
		trigger?.setAttribute('aria-expanded', 'false');
		menu?.hide();
		if (restoreFocus && this.panel) trigger?.focus();
	}

	private renderSelectedX(container: HTMLElement): void {
		this.closeDateGroupingMenu();
		container.empty();
		const x = this.view.config.getAsPropertyId(COMMON_SETTINGS.X);
		if (!x) {
			container.createDiv({ cls: 'bases-chart-panel-description', text: 'Choose a property below.' });
			return;
		}
		const name = this.view.config.getDisplayName(x);
		const row = container.createDiv({ cls: 'bases-chart-selected-property bases-chart-selected-x' });
		row.dataset.property = x;
		row.setAttribute('aria-label', `Selected ${this.axisLabel('x')}: ${name}`);
		setIcon(row.createSpan({ cls: 'bases-chart-property-icon' }), this.propertyIcon(x));
		row.createSpan({ cls: 'bases-chart-property-name', text: name }).setAttribute('title', x);
		setIcon(row.createSpan({ cls: 'bases-chart-property-check', attr: { 'aria-label': 'Selected' } }), 'check');
		this.propertyEditButton(row, 'x', x);
		if (this.view.isDateXAxis()) {
			const groupingRow = container.createDiv({ cls: 'bases-chart-date-grouping' });
			groupingRow.createSpan({ text: 'Date grouping' });
			const dropdown = groupingRow.createEl('button', {
				cls: 'dropdown', text: DATE_GROUPING_OPTIONS[this.view.getXDateGrouping()],
				attr: { type: 'button', 'aria-label': 'Date grouping', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
			});
			dropdown.addEventListener('click', () => this.openDateGroupingMenu(dropdown));
			dropdown.addEventListener('keydown', event => {
				if (!this.dateGroupingMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
					event.preventDefault();
					this.openDateGroupingMenu(dropdown);
				}
			});
			container.createDiv({ cls: 'bases-chart-panel-description bases-chart-date-hint', text: 'Local calendar dates. Weeks start on Monday.' });
		}
	}

	private renderProperties(container: HTMLElement, axis: Axis, query: string, render: () => void): void {
		container.empty();
		const selected = this.view.getYProperties();
		const x = this.view.config.getAsPropertyId(COMMON_SETTINGS.X);
		const properties = [...new Set([...this.view.allProperties, ...selected, ...(x ? [x] : [])])];
		const needle = query.trim().toLocaleLowerCase();
		const sections = [['file.', 'File properties'], ['note.', 'Note properties'], ['formula.', 'Formulas']] as const;
		let count = 0;
		for (const [prefix, title] of sections) {
			const matches = properties.filter(id => id.startsWith(prefix)
				&& (axis === 'x' ? id !== x : !selected.includes(id))
				&& `${id} ${this.view.config.getDisplayName(id)}`.toLocaleLowerCase().includes(needle));
			matches.sort((a, b) => this.view.config.getDisplayName(a).localeCompare(this.view.config.getDisplayName(b)));
			if (!matches.length) continue;
			container.createDiv({ cls: 'bases-chart-property-section', text: title });
			for (const id of matches) {
				count++;
				const row = container.createDiv({ cls: 'bases-chart-property-row' });
				row.dataset.property = id;
				const choice = row.createEl('button', { cls: 'bases-chart-property-option' });
				choice.type = 'button';
				choice.dataset.property = id;
				choice.setAttribute('aria-label', `${axis === 'x' ? 'Use' : 'Add'} ${this.view.config.getDisplayName(id)} (${id})`);
				setIcon(choice.createSpan({ cls: 'bases-chart-property-icon' }), this.propertyIcon(id));
				choice.createSpan({ cls: 'bases-chart-property-name', text: this.view.config.getDisplayName(id) });
				if (axis === 'y') setIcon(choice.createSpan({ cls: 'bases-chart-property-add', attr: { 'aria-hidden': 'true' } }), 'plus');
				choice.addEventListener('click', () => {
					if (axis === 'x') {
						this.view.config.set(COMMON_SETTINGS.X, id);
						this.changed();
						this.closePanel?.();
						this.buttons.get('x')?.focus();
					} else {
						const order = this.view.getYProperties();
						if (!order.includes(id)) {
							if (this.view.config.get(aggregateKey(id)) == null) {
								const numeric = this.view.data.data.some(entry => parseValueAsNumber(entry.getValue(id)) !== null);
								this.view.config.set(aggregateKey(id), numeric ? this.view.getDefaultAggregateMode() : AggregateMode.COUNT);
							}
							this.view.config.set(COMMON_SETTINGS.Y, [...order, id]);
						}
						this.changed();
						render();
						this.panel?.querySelector<HTMLInputElement>('input')?.focus();
					}
				});
				this.propertyEditButton(row, axis, id);
			}
		}
		if (!count) container.createDiv({ cls: 'bases-chart-panel-description', text: 'No matching properties.' });
	}

	private renderSelected(container: HTMLElement, render: () => void): void {
		container.empty();
		const order = this.view.getYProperties();
		if (!order.length) container.createDiv({ cls: 'bases-chart-panel-description', text: 'Add a property below to create a chart.' });
		for (const [index, id] of order.entries()) {
			const name = this.view.config.getDisplayName(id);
			const row = container.createDiv({ cls: 'bases-chart-selected-property' });
			row.dataset.property = id;
			const property = row.createDiv({ cls: 'bases-chart-selected-name' });
			setIcon(property.createSpan({ cls: 'bases-chart-property-icon' }), this.propertyIcon(id));
			property.createSpan({ cls: 'bases-chart-property-name', text: name }).setAttribute('title', id);
			this.propertyEditButton(property, 'y', id);
			const aggregate = new DropdownComponent(row);
			const select = aggregate.selectEl;
			select.addClass('bases-chart-aggregate-select');
			select.setAttribute('aria-label', `Aggregate ${name}`);
			for (const mode of Object.values(AggregateMode)) {
				if (mode === AggregateMode.NONE && this.view.type !== 'chart-scatter') continue;
				aggregate.addOption(mode, mode);
			}
			aggregate.setValue(this.view.getAggregateModeForProperty(id)).onChange(value => {
				this.view.config.set(aggregateKey(id), value);
				this.changed();
			});
			const actions = row.createDiv({ cls: 'bases-chart-property-actions' });
			const move = (offset: number) => {
				const next = [...this.view.getYProperties()];
				const from = next.indexOf(id);
				const to = from + offset;
				if (from < 0 || to < 0 || to >= next.length) return;
				[next[from], next[to]] = [next[to], next[from]];
				this.view.config.set(COMMON_SETTINGS.Y, next);
				this.changed();
				render();
				const movedRow = Array.from(container.children).find(child => (child as HTMLElement).dataset.property === id);
				const movedButton = Array.from(movedRow?.querySelectorAll<HTMLButtonElement>('button') ?? [])
					.find(button => button.getAttribute('aria-label') === `Move ${name} ${offset < 0 ? 'up' : 'down'}`);
				if (movedButton && !movedButton.disabled) movedButton.focus();
				else this.panel?.querySelector<HTMLInputElement>('input')?.focus();
			};
			this.iconButton(actions, 'arrow-up', `Move ${name} up`, () => move(-1)).disabled = index === 0;
			this.iconButton(actions, 'arrow-down', `Move ${name} down`, () => move(1)).disabled = index === order.length - 1;
			this.iconButton(actions, 'x', `Remove ${name}`, () => {
				this.view.config.set(COMMON_SETTINGS.Y, this.view.getYProperties().filter(prop => prop !== id));
				this.changed();
				render();
				this.panel?.querySelector<HTMLInputElement>('input')?.focus();
			});
		}
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, click: () => void): HTMLButtonElement {
		const button = parent.createEl('button', { cls: 'clickable-icon' });
		button.type = 'button';
		button.setAttribute('aria-label', label);
		button.setAttribute('title', label);
		setIcon(button, icon);
		button.addEventListener('click', click);
		return button;
	}

	private changed(): void {
		this.view.events.trigger('data-updated');
	}

	private detach(): void {
		this.closePanel?.();
		this.items.forEach(item => item.remove());
		this.items = [];
		this.buttons.clear();
		this.toolbar?.removeClass('bases-chart-toolbar');
		this.toolbar = null;
		this.fallback?.remove();
		this.fallback = null;
	}

	onunload(): void {
		this.detach();
	}
}
