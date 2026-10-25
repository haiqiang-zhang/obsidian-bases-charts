import { SearchComponent, setIcon } from 'obsidian';
import { CHART_PALETTES, getChartPalette, getPaletteColors } from './chartPalettes';
import type { ChartPalette } from './chartPalettes';

let nextPickerId = 0;

/** Identify only our own native setting; leave other plugins' dropdowns alone. */
export function isChartPaletteSelect(select: HTMLSelectElement): boolean {
	return !select.classList.contains('is-measuring')
		&& select.options.length === CHART_PALETTES.length
		&& CHART_PALETTES.every((palette, index) =>
			select.options[index].value === palette.id && select.options[index].text === palette.name);
}

/** Progressive enhancement: the original select still owns the target view and saving. */
export class ChartPalettePicker {
	readonly button: HTMLButtonElement;
	private panel: HTMLElement | null = null;
	private list: HTMLElement | null = null;
	private search: HTMLInputElement | null = null;
	private rows: HTMLButtonElement[] = [];
	private activeIndex = 0;
	private id = `bases-chart-palette-${nextPickerId++}`;
	private closeListeners: (() => void) | null = null;
	private toggle = () => this.panel ? this.close(true) : this.open();
	private changed = () => this.refresh();

	constructor(readonly select: HTMLSelectElement) {
		this.button = select.ownerDocument.createDocumentFragment().createEl('button', {
			cls: 'dropdown bases-chart-palette-trigger',
			attr: { type: 'button', 'aria-label': 'Color palette', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
		});
		select.after(this.button);
		select.addClass('bases-chart-palette-native');
		this.button.addEventListener('click', this.toggle);
		select.addEventListener('change', this.changed);
		this.refresh();
	}

	private swatches(parent: HTMLElement, id: string): void {
		const colors = getPaletteColors(id, parent.ownerDocument.body.classList.contains('theme-dark'));
		const strip = parent.createSpan({ cls: 'bases-chart-palette-swatches', attr: { 'aria-hidden': 'true' } });
		for (let i = 0; i < 5; i++) {
			strip.createSpan({ cls: 'bases-chart-palette-swatch' }).style.setProperty('background-color', colors[Math.round(i * (colors.length - 1) / 4)]);
		}
	}

	refresh(): void {
		const current = getChartPalette(this.select.value);
		this.button.empty();
		this.button.createSpan({ cls: 'bases-chart-palette-name', text: current.name });
		this.swatches(this.button, current.id);
		this.button.setAttribute('aria-label', `Color palette: ${current.name}`);
		if (this.panel) this.renderResults();
	}

	private renderResults(): void {
		if (!this.list || !this.search) return;
		const query = this.search.value.trim().toLocaleLowerCase();
		const current = getChartPalette(this.select.value);
		const choices = CHART_PALETTES.filter(palette => palette.name.toLocaleLowerCase().includes(query));
		const selected = choices.find(palette => palette.id === current.id);
		const ordered = selected ? [selected, ...choices.filter(palette => palette !== selected)] : choices;
		this.list.empty();
		this.rows = ordered.map(palette => {
			const row = this.list!.createEl('button', {
				cls: 'suggestion-item bases-chart-palette-option',
				attr: { type: 'button', role: 'option', 'aria-selected': String(palette.id === current.id), tabindex: '-1' },
			});
			row.dataset.palette = palette.id;
			row.id = `${this.id}-${palette.id}`;
			row.createSpan({ cls: 'bases-chart-palette-name', text: palette.name });
			this.swatches(row, palette.id);
			const check = row.createSpan({ cls: 'bases-chart-palette-check', attr: { 'aria-hidden': 'true' } });
			if (palette.id === current.id) setIcon(check, 'check');
			row.addEventListener('click', () => this.choose(palette));
			row.addEventListener('pointermove', () => this.activate(this.rows.indexOf(row)));
			return row;
		});
		if (!ordered.length) this.list.createDiv({ cls: 'bases-chart-palette-empty', text: 'No matching palettes' });
		if (!ordered.length) this.search.removeAttribute('aria-activedescendant');
		this.activate(0);
	}

	private activate(index: number, scroll = false): void {
		if (!this.rows.length) return;
		this.activeIndex = (index + this.rows.length) % this.rows.length;
		this.rows.forEach((row, i) => row.toggleClass('is-selected', i === this.activeIndex));
		this.search?.setAttribute('aria-activedescendant', this.rows[this.activeIndex].id);
		if (scroll) this.rows[this.activeIndex].scrollIntoView({ block: 'nearest' });
	}

	private choose(palette: ChartPalette): void {
		const win = this.select.ownerDocument.defaultView;
		if (!win || !this.select.isConnected) return;
		this.select.value = palette.id;
		// Native onchange closes over the configured view, which may not be the
		// active view. Never replace this with a write to the active chart config.
		this.select.dispatchEvent(new win.Event('change', { bubbles: true }));
		this.refresh();
		this.close(true);
	}

	open(): void {
		if (this.panel || !this.select.isConnected) return;
		const doc = this.button.ownerDocument;
		const win = doc.defaultView;
		const host = this.select.closest<HTMLElement>('.bases-toolbar-menu') ?? this.select.closest<HTMLElement>('.view-config-menu');
		if (!win || !host) return;
		// Keep the nested popup inside its native menu, so clicking a palette
		// doesn't dismiss Configure view before its native onchange runs.
		const panel = host.createDiv({ cls: 'suggestion-container bases-chart-palette-popover', attr: { role: 'dialog', 'aria-label': 'Choose color palette' } });
		this.panel = panel;
		this.button.setAttribute('aria-expanded', 'true');
		const search = new SearchComponent(panel.createDiv({ cls: 'bases-chart-palette-search' })).setPlaceholder('Search palettes…');
		this.search = search.inputEl;
		this.search.setAttribute('aria-label', 'Search color palettes');
		this.search.setAttribute('role', 'combobox');
		this.search.setAttribute('aria-autocomplete', 'list');
		this.search.setAttribute('aria-expanded', 'true');
		this.search.setAttribute('aria-controls', `${this.id}-list`);
		this.list = panel.createDiv({ cls: 'suggestion bases-chart-palette-list', attr: { role: 'listbox', 'aria-label': 'Color palettes' } });
		this.list.id = `${this.id}-list`;
		search.onChange(() => this.renderResults());
		this.renderResults();
		const rect = this.button.getBoundingClientRect();
		const width = Math.max(0, Math.min(Math.max(rect.width, 280), win.innerWidth - 16));
		const below = win.innerHeight - rect.bottom - 14;
		const above = rect.top - 14;
		const short = Math.max(below, above) < 180;
		const useBelow = below >= 260 || below >= above;
		const maxHeight = Math.min(420, short ? win.innerHeight - 16 : useBelow ? below : above);
		panel.style.setProperty('--chart-palette-width', `${width}px`);
		panel.style.setProperty('--chart-palette-height', `${Math.max(0, maxHeight)}px`);
		panel.style.setProperty('--chart-palette-left', `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`);
		if (short || useBelow) panel.style.setProperty('--chart-palette-top', `${short ? 8 : rect.bottom + 4}px`);
		else panel.style.setProperty('--chart-palette-bottom', `${win.innerHeight - rect.top + 4}px`);
		const onOutside = (event: PointerEvent) => {
			if (!event.composedPath().includes(panel) && !event.composedPath().includes(this.button)) this.close();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault(); event.stopImmediatePropagation(); this.close(true);
			} else if (event.composedPath().includes(panel)) {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault(); event.stopPropagation();
					this.activate(this.activeIndex + (event.key === 'ArrowDown' ? 1 : -1), true);
				} else if (event.key === 'Enter' && this.rows.length) {
					event.preventDefault(); event.stopPropagation(); this.rows[this.activeIndex].click();
				} else if (event.key === 'Tab') this.close(true);
			}
		};
		const onResize = () => this.close();
		const onScroll = (event: Event) => { if (!event.composedPath().includes(panel)) this.close(); };
		doc.addEventListener('pointerdown', onOutside, true);
		doc.addEventListener('keydown', onKey, true);
		win.addEventListener('resize', onResize);
		win.addEventListener('scroll', onScroll, true);
		this.closeListeners = () => {
			doc.removeEventListener('pointerdown', onOutside, true);
			doc.removeEventListener('keydown', onKey, true);
			win.removeEventListener('resize', onResize);
			win.removeEventListener('scroll', onScroll, true);
		};
		this.search.focus();
	}

	close(restoreFocus = false): void {
		this.closeListeners?.();
		this.closeListeners = null;
		this.panel?.remove();
		this.panel = this.list = this.search = null;
		this.rows = [];
		this.button.setAttribute('aria-expanded', 'false');
		if (restoreFocus && this.button.isConnected) this.button.focus();
	}

	destroy(): void {
		this.close();
		this.select.removeEventListener('change', this.changed);
		this.select.removeClass('bases-chart-palette-native');
		this.button.removeEventListener('click', this.toggle);
		this.button.remove();
	}
}
