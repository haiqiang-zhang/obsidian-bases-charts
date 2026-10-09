import { Component, setIcon } from 'obsidian';
import type { DataChartView } from '../dataCharts/dataChartView';
import { AggregateMode, aggregateKey } from '../dataCharts/aggregate';
import { COMMON_SETTINGS } from '../dataCharts/types';
import { parseValueAsNumber } from '../utils/utils';

type Axis = 'x' | 'y';

/** The only DOM adapter for the native toolbar; all settings use BasesViewConfig. */
export class ChartToolbar extends Component {
	private toolbar: HTMLElement | null = null;
	private fallback: HTMLElement | null = null;
	private buttons = new Map<Axis, HTMLButtonElement>();
	private items: HTMLElement[] = [];
	private panel: HTMLElement | null = null;
	private closePanel: (() => void) | null = null;

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
		if (this.view.type === 'chart-pie') return axis === 'x' ? 'Category' : 'Values';
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
				const icon = this.view.type === 'chart-pie'
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
		this.updateButton('x', x ? this.view.config.getDisplayName(x) : 'Choose',
			x ? `${this.axisLabel('x')}: ${this.view.config.getDisplayName(x)}` : `Choose ${this.axisLabel('x')}`);
		this.updateButton('y', String(y.length), `${this.axisLabel('y')}: ${y.length} selected`);
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
		panel.createDiv({ cls: 'bases-chart-panel-title', text: this.axisLabel(axis) });
		panel.createDiv({ cls: 'bases-chart-panel-description', text: axis === 'x'
			? 'Choose a file property, note property, or formula.'
			: 'Each property creates a chart. Choose how its values are combined.' });
		const selected = axis === 'y' ? panel.createDiv({ cls: 'bases-chart-selected-properties' }) : null;
		const search = panel.createEl('input', { cls: 'bases-chart-property-search', type: 'search', placeholder: 'Find a property…' });
		search.setAttribute('aria-label', 'Find a property');
		const results = panel.createDiv({ cls: 'bases-chart-property-results' });

		const render = () => {
			if (selected) this.renderSelected(selected, render);
			this.renderProperties(results, axis, search.value, render);
		};
		search.addEventListener('input', render);
		render();

		const rect = button.getBoundingClientRect();
		const width = Math.min(420, win.innerWidth - 16);
		panel.style.setProperty('--chart-panel-width', `${width}px`);
		panel.style.setProperty('--chart-panel-left', `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`);
		const below = win.innerHeight - rect.bottom - 16;
		if (below >= 240 || rect.top < below) {
			panel.style.setProperty('--chart-panel-top', `${rect.bottom + 6}px`);
			panel.style.setProperty('--chart-panel-height', `${Math.max(120, below)}px`);
		} else {
			panel.style.setProperty('--chart-panel-bottom', `${win.innerHeight - rect.top + 6}px`);
			panel.style.setProperty('--chart-panel-height', `${Math.max(120, rect.top - 16)}px`);
		}

		const onOutside = (event: PointerEvent) => {
			const path = event.composedPath();
			if (!path.includes(panel) && !path.includes(button)) this.closePanel?.();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				this.closePanel?.();
				button.focus();
			}
			if (event.key === 'ArrowDown' && event.target === search) {
				event.preventDefault();
				results.querySelector<HTMLButtonElement>('button')?.focus();
			}
		};
		const onResize = () => this.closePanel?.();
		const onFocus = (event: FocusEvent) => {
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
			panel.remove();
			button.setAttribute('aria-expanded', 'false');
			this.panel = null;
			this.closePanel = null;
		};
		search.focus();
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
				&& (axis === 'x' || !selected.includes(id))
				&& `${id} ${this.view.config.getDisplayName(id)}`.toLocaleLowerCase().includes(needle));
			matches.sort((a, b) => this.view.config.getDisplayName(a).localeCompare(this.view.config.getDisplayName(b)));
			if (!matches.length) continue;
			container.createDiv({ cls: 'bases-chart-property-section', text: title });
			for (const id of matches) {
				count++;
				const row = container.createEl('button', { cls: 'bases-chart-property-option' });
				row.type = 'button';
				row.dataset.property = id;
				row.setAttribute('aria-label', `${axis === 'x' ? 'Use' : 'Add'} ${this.view.config.getDisplayName(id)} (${id})`);
				if (axis === 'x') row.setAttribute('aria-pressed', String(id === x));
				setIcon(row.createSpan({ cls: 'bases-chart-property-icon' }), id === x && axis === 'x' ? 'check' : axis === 'y' ? 'plus' : prefix === 'file.' ? 'file' : prefix === 'formula.' ? 'square-function' : 'hash');
				row.createSpan({ cls: 'bases-chart-property-name', text: this.view.config.getDisplayName(id) });
				row.addEventListener('click', () => {
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
			row.createSpan({ cls: 'bases-chart-property-name', text: name }).setAttribute('title', id);
			const select = row.createEl('select', { cls: 'dropdown bases-chart-aggregate-select' });
			select.setAttribute('aria-label', `Aggregate ${name}`);
			for (const mode of Object.values(AggregateMode)) {
				if (mode === AggregateMode.NONE && this.view.type !== 'chart-scatter') continue;
				select.createEl('option', { value: mode, text: mode });
			}
			select.value = this.view.getAggregateModeForProperty(id);
			select.addEventListener('change', () => {
				this.view.config.set(aggregateKey(id), select.value);
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
				const movedButton = movedRow?.querySelectorAll<HTMLButtonElement>('button')[offset < 0 ? 0 : 1];
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
