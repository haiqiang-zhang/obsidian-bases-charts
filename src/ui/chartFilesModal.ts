import { Modal, Platform } from 'obsidian';
import type { App } from 'obsidian';

export interface ChartFileItem {
	path: string;
	value: number;
	group?: string;
}

export interface ChartFileDetails {
	xName: string;
	xValue: string;
	yLabel: string;
	groupLabel?: string;
}

const PAGE_SIZE = 100;
let nextAccessibleLabelId = 0;

interface IndexedFile {
	file: ChartFileItem;
	searchPath: string;
}

export class ChartFilesModal extends Modal {
	private readonly indexedFiles: IndexedFile[];
	private readonly hasGroups: boolean;
	private matches: IndexedFile[] = [];
	private shown = 0;
	private listEl: HTMLElement | null = null;
	private rowsEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;
	private moreButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly summary: string,
		files: readonly ChartFileItem[],
		private readonly openFile: (path: string, newTab: boolean) => Promise<void>,
		private readonly details?: ChartFileDetails,
	) {
		super(app);
		this.indexedFiles = files.map(file => ({ file, searchPath: file.path.toLocaleLowerCase() }));
		this.hasGroups = files.some(file => file.group !== undefined);
	}

	onOpen(): void {
		this.setTitle(this.details?.xValue ?? this.heading);
		this.containerEl.addClass('bases-chart-files-container');
		this.modalEl.addClass('bases-chart-files-modal');
		this.modalEl.toggleClass('mod-lg', Platform.isPhone);
		this.contentEl.addClass('bases-chart-files-content');
		this.contentEl.empty();
		const conditions = this.contentEl.createDiv({ cls: 'bases-chart-files-conditions' });
		if (this.details) {
			const chip = conditions.createDiv({ cls: 'bases-chart-files-condition' });
			chip.createSpan({ cls: 'bases-chart-files-condition-property', text: this.details.xName });
			const match = chip.createSpan({ cls: 'bases-chart-files-condition-match' });
			match.createSpan({ cls: 'bases-chart-files-condition-operator', text: 'is' });
			match.createSpan({ cls: 'bases-chart-files-condition-value', text: this.details.xValue });
		}
		conditions.createDiv({ cls: 'bases-chart-files-summary', text: this.summary });
		const tools = this.contentEl.createDiv({ cls: 'bases-chart-files-tools' });
		this.countEl = tools.createDiv({ cls: 'bases-chart-files-count' });
		this.countEl.setAttribute('aria-live', 'polite');
		const search = tools.createEl('input', {
			cls: 'bases-chart-files-search',
			type: 'search',
			placeholder: 'Find a file or folder…',
		});
		this.setAccessibleLabel(search, 'Find a file by name or path');
		this.listEl = this.contentEl.createDiv({ cls: 'bases-chart-files-list' });
		const table = this.listEl.createEl('table', { cls: 'bases-chart-files-table' });
		this.setAccessibleLabel(table, `Files for ${this.details?.xValue ?? this.heading}`);
		// Explicit table roles preserve the same accessible structure when phone
		// styles lay out each row as a compact grid instead of table columns.
		table.setAttribute('role', 'table');
		if (this.hasGroups) table.addClass('bases-chart-files-table-grouped');
		const head = table.createEl('thead');
		head.setAttribute('role', 'rowgroup');
		const header = head.createEl('tr');
		header.setAttribute('role', 'row');
		const addHeading = (cls: string, text: string) => {
			const cell = header.createEl('th', { cls, text });
			cell.setAttribute('scope', 'col');
			cell.setAttribute('role', 'columnheader');
		};
		addHeading('bases-chart-files-file-heading', 'File');
		if (this.hasGroups) addHeading('bases-chart-files-group-heading', this.details?.groupLabel || 'Group');
		addHeading('bases-chart-files-value-heading', this.details?.yLabel || 'Value');
		this.rowsEl = table.createEl('tbody', { cls: 'bases-chart-files-table-body' });
		this.rowsEl.setAttribute('role', 'rowgroup');
		this.footerEl = this.contentEl.createDiv({ cls: 'bases-chart-files-footer' });
		this.moreButton = this.footerEl.createEl('button', { cls: 'bases-chart-files-more', text: 'Load more' });
		this.moreButton.type = 'button';
		this.moreButton.addEventListener('click', () => this.appendPage()?.focus());
		search.addEventListener('input', () => this.filter(search.value));
		this.filter('');
		// A data selection opens for reading. Let the native phone Modal manage
		// focus so the software keyboard appears only when search is tapped.
		if (!Platform.isMobile) search.focus();
	}

	private setAccessibleLabel(element: HTMLElement, text: string): void {
		// Obsidian also uses aria-label for hover tooltips. Referenced text keeps
		// the accessible name without showing a redundant hint over the modal.
		const label = this.contentEl.createSpan({ text });
		label.id = `bases-chart-files-label-${++nextAccessibleLabelId}`;
		label.hidden = true;
		element.setAttribute('aria-labelledby', label.id);
	}

	private filter(query: string): void {
		const needle = query.trim().toLocaleLowerCase();
		this.matches = needle ? this.indexedFiles.filter(item => item.searchPath.includes(needle)) : this.indexedFiles;
		this.shown = 0;
		this.rowsEl?.empty();
		if (this.listEl) this.listEl.scrollTop = 0;
		if (this.matches.length === 0) {
			const row = this.rowsEl?.createEl('tr', { cls: 'bases-chart-files-empty-row' });
			row?.setAttribute('role', 'row');
			const cell = row?.createEl('td', { cls: 'bases-chart-files-empty', text: needle ? 'No matching files.' : 'No files.' });
			if (cell) {
				cell.colSpan = this.hasGroups ? 3 : 2;
				cell.setAttribute('role', 'cell');
			}
		}
		this.appendPage();
	}

	private appendPage(): HTMLButtonElement | null {
		if (!this.rowsEl) return null;
		let firstRow: HTMLButtonElement | null = null;
		const end = Math.min(this.shown + PAGE_SIZE, this.matches.length);
		for (let index = this.shown; index < end; index++) {
			const { file } = this.matches[index];
			const row = this.rowsEl.createEl('tr', { cls: 'bases-chart-file-row' });
			row.setAttribute('role', 'row');
			const fileCell = row.createEl('td', { cls: 'bases-chart-file-cell' });
			fileCell.setAttribute('role', 'cell');
			const button = fileCell.createEl('button', { cls: 'bases-chart-file-open' });
			firstRow ??= button;
			button.type = 'button';
			const separator = file.path.lastIndexOf('/');
			const name = file.path.slice(separator + 1).replace(/\.[^.]+$/, '');
			const folder = separator >= 0 ? file.path.slice(0, separator) : '/';
			const details = button.createSpan({ cls: 'bases-chart-file-details' });
			details.createSpan({ cls: 'bases-chart-file-name', text: name });
			details.createSpan({ cls: 'bases-chart-file-folder', text: folder });
			if (this.hasGroups) {
				const group = row.createEl('td', { cls: 'bases-chart-file-group', text: file.group ?? '—' });
				group.setAttribute('role', 'cell');
				group.setAttribute('data-label', this.details?.groupLabel || 'Group');
			}
			const value = row.createEl('td', { cls: 'bases-chart-file-value', text: String(file.value) });
			value.setAttribute('role', 'cell');
			value.setAttribute('data-label', this.details?.yLabel || 'Value');
			row.addEventListener('click', (event: MouseEvent) => {
				this.close();
				void this.openFile(file.path, event.ctrlKey || event.metaKey);
			});
		}
		this.shown = end;
		if (this.countEl) {
			const total = this.indexedFiles.length;
			this.countEl.textContent = `${this.shown} of ${this.matches.length} files shown${this.matches.length !== total ? ` (${total} total)` : ''}`;
		}
		if (this.footerEl) this.footerEl.hidden = this.shown >= this.matches.length;
		return firstRow;
	}

	onClose(): void {
		this.contentEl.empty();
		this.listEl = null;
		this.rowsEl = null;
		this.countEl = null;
		this.footerEl = null;
		this.moreButton = null;
		this.matches = [];
	}
}
