import { setIcon } from 'obsidian';
import { CHART_PALETTES, getChartPalette, getPaletteColors } from './chartPalettes';

interface PalettePickerOptions {
	getValue: () => unknown;
	onSelect: (id: string) => void;
	onOpen: () => void;
}

/** Swatch preview for the same per-view setting exposed in native view options. */
export class ChartPalettePicker {
	private panel: HTMLElement | null = null;
	private cleanup: (() => void) | null = null;
	private rows: HTMLButtonElement[] = [];
	private summary: HTMLElement;
	private toggle = () => this.panel ? this.close() : this.open();

	constructor(private button: HTMLButtonElement, private options: PalettePickerOptions) {
		button.type = 'button';
		button.setAttribute('aria-haspopup', 'menu');
		button.setAttribute('aria-expanded', 'false');
		setIcon(button.createSpan({ cls: 'text-button-icon' }), 'palette');
		button.createSpan({ cls: 'text-button-label', text: 'Color' });
		this.summary = button.createSpan({ cls: 'bases-chart-axis-summary' });
		button.addEventListener('click', this.toggle);
		this.update();
	}

	update(): void {
		const current = getChartPalette(this.options.getValue());
		this.summary.textContent = current.name;
		this.button.setAttribute('aria-label', `Color palette: ${current.name}`);
		this.button.setAttribute('title', `Color palette: ${current.name}`);
		if (!this.panel) return;
		const isDark = this.button.ownerDocument.body.classList.contains('theme-dark');
		for (const row of this.rows) {
			const selected = row.dataset.palette === current.id;
			row.setAttribute('aria-checked', String(selected));
			row.tabIndex = selected ? 0 : -1;
			const colors = getPaletteColors(row.dataset.palette, isDark);
			const swatches = row.querySelectorAll<HTMLElement>('.bases-chart-palette-swatch');
			swatches.forEach((swatch, index) => {
				const colorIndex = Math.round(index * (colors.length - 1) / (swatches.length - 1));
				swatch.style.setProperty('background-color', colors[colorIndex]);
			});
		}
	}

	open(): void {
		if (this.panel) return;
		const doc = this.button.ownerDocument;
		const win = doc.defaultView;
		if (!win) return;
		this.options.onOpen();
		const panel = doc.body.createDiv({ cls: 'bases-chart-palette-panel' });
		this.panel = panel;
		const header = panel.createDiv({ cls: 'bases-chart-panel-header' });
		header.createDiv({ cls: 'bases-chart-panel-title', text: 'Color palette' });
		const close = header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Close color palette' } });
		close.type = 'button';
		setIcon(close, 'x');
		close.addEventListener('click', () => this.close(true));
		const list = panel.createDiv({ cls: 'bases-chart-palette-list', attr: { role: 'menu', 'aria-label': 'Color palette for this view' } });
		let lastKind = '';
		for (const palette of CHART_PALETTES) {
			if (palette.kind !== lastKind) {
				list.createDiv({ cls: 'bases-chart-palette-heading', text: palette.kind === 'categorical' ? 'Palettes' : 'Single color', attr: { role: 'presentation' } });
				lastKind = palette.kind;
			}
			const row = list.createEl('button', { cls: 'bases-chart-palette-option', attr: { role: 'menuitemradio' } });
			row.type = 'button';
			row.dataset.palette = palette.id;
			row.createSpan({ cls: 'bases-chart-palette-name', text: palette.name });
			const swatches = row.createSpan({ cls: 'bases-chart-palette-swatches', attr: { 'aria-hidden': 'true' } });
			for (let i = 0; i < 5; i++) swatches.createSpan({ cls: 'bases-chart-palette-swatch' });
			const check = row.createSpan({ cls: 'bases-chart-palette-check', attr: { 'aria-hidden': 'true' } });
			setIcon(check, 'check');
			row.addEventListener('click', () => {
				this.options.onSelect(palette.id);
				this.update();
				this.close(true);
			});
			this.rows.push(row);
		}
		this.button.setAttribute('aria-expanded', 'true');
		this.update();

		const rect = this.button.getBoundingClientRect();
		const width = Math.max(0, Math.min(320, win.innerWidth - 16));
		const below = win.innerHeight - rect.bottom - 14;
		const above = rect.top - 14;
		const short = Math.max(below, above) < 240;
		const useBelow = below >= above;
		const height = short ? win.innerHeight - 16 : (useBelow ? below : above);
		panel.style.setProperty('--chart-palette-width', `${width}px`);
		panel.style.setProperty('--chart-palette-height', `${Math.max(0, height)}px`);
		panel.style.setProperty('--chart-palette-left', `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`);
		if (short || useBelow) panel.style.setProperty('--chart-palette-top', `${short ? 8 : rect.bottom + 6}px`);
		else panel.style.setProperty('--chart-palette-bottom', `${win.innerHeight - rect.top + 6}px`);

		const onOutside = (event: PointerEvent) => {
			if (!event.composedPath().includes(panel) && !event.composedPath().includes(this.button)) this.close();
		};
		const onFocus = (event: FocusEvent) => {
			if (!event.composedPath().includes(panel) && event.target !== this.button) this.close();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				this.close(true);
			} else if (event.composedPath().includes(panel) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
				event.preventDefault();
				const index = this.rows.indexOf(doc.activeElement as HTMLButtonElement);
				const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.rows.length - 1
					: index < 0 ? (event.key === 'ArrowDown' ? 0 : this.rows.length - 1)
					: (index + (event.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % this.rows.length;
				this.rows.forEach((row, i) => { row.tabIndex = i === next ? 0 : -1; });
				this.rows[next].focus();
			}
		};
		const onResize = () => this.close();
		doc.addEventListener('pointerdown', onOutside, true);
		doc.addEventListener('focusin', onFocus);
		doc.addEventListener('keydown', onKey, true);
		win.addEventListener('resize', onResize);
		this.cleanup = () => {
			doc.removeEventListener('pointerdown', onOutside, true);
			doc.removeEventListener('focusin', onFocus);
			doc.removeEventListener('keydown', onKey, true);
			win.removeEventListener('resize', onResize);
		};
		this.rows.find(row => row.getAttribute('aria-checked') === 'true')?.focus();
	}

	close(restoreFocus = false): void {
		this.cleanup?.();
		this.cleanup = null;
		this.panel?.remove();
		this.panel = null;
		this.rows = [];
		this.button.setAttribute('aria-expanded', 'false');
		if (restoreFocus) this.button.focus();
	}

	destroy(): void {
		this.close();
		this.button.removeEventListener('click', this.toggle);
	}
}
