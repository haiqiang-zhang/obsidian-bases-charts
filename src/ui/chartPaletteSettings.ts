import { Component } from 'obsidian';
import type { App } from 'obsidian';
import { ChartPalettePicker, isChartPaletteSelect } from './chartPalettePicker';

/** Narrow adapter for native Bases dropdowns, until view options support rich items. */
export class ChartPaletteSettings extends Component {
	private documents = new Map<Document, () => void>();
	private pickers = new Map<HTMLSelectElement, ChartPalettePicker>();
	private active = false;

	constructor(private app: App) { super(); }

	onload(): void {
		this.active = true;
		this.attach(this.app.workspace.containerEl.ownerDocument);
		this.app.workspace.onLayoutReady(() => {
			if (this.active) this.app.workspace.iterateAllLeaves(leaf => this.attach(leaf.view.containerEl.ownerDocument));
		});
		this.registerEvent(this.app.workspace.on('window-open', (_container, win) => this.attach(win.document)));
		this.registerEvent(this.app.workspace.on('window-close', (_container, win) => this.detach(win.document)));
		this.registerEvent(this.app.workspace.on('css-change', () => this.pickers.forEach(picker => picker.refresh())));
	}

	private attach(doc: Document): void {
		if (this.documents.has(doc) || !doc.defaultView) return;
		const scan = () => {
			for (const [select, picker] of this.pickers) {
				if (select.ownerDocument === doc && !select.isConnected) {
					picker.destroy(); this.pickers.delete(select);
				}
			}
			for (const select of Array.from(doc.querySelectorAll<HTMLSelectElement>('.view-config-menu select.dropdown:not(.is-measuring)'))) {
				if (!this.pickers.has(select) && isChartPaletteSelect(select)) this.pickers.set(select, new ChartPalettePicker(select));
			}
		};
		const observer = new doc.defaultView.MutationObserver(records => {
			const relevant = records.some(record => {
				// Native settings can be rebuilt inside the same menu root.
				if (record.target.nodeType === 1 && (record.target as Element).closest('.view-config-menu')) return true;
				return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
					if (node.nodeType !== 1) return false;
					const element = node as Element;
					return element.matches('.view-config-menu') || !!element.querySelector('.view-config-menu');
				});
			});
			if (relevant) scan();
		});
		observer.observe(doc.body, { childList: true, subtree: true });
		this.documents.set(doc, () => observer.disconnect());
		scan();
	}

	private detach(doc: Document): void {
		this.documents.get(doc)?.();
		this.documents.delete(doc);
		for (const [select, picker] of this.pickers) {
			if (select.ownerDocument === doc) { picker.destroy(); this.pickers.delete(select); }
		}
	}

	onunload(): void {
		this.active = false;
		for (const doc of this.documents.keys()) this.detach(doc);
	}
}
