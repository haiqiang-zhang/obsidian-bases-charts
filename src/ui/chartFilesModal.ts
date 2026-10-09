import { Modal } from 'obsidian';
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
}

const PAGE_SIZE = 100;

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
		this.modalEl.addClass('bases-chart-files-modal');
		this.contentEl.addClass('bases-chart-files-content');
		this.contentEl.empty();
		const conditions = this.contentEl.createDiv({ cls: 'bases-chart-files-conditions' });
		if (this.details) {
			const chip = conditions.createDiv({ cls: 'bases-chart-files-condition' });
			chip.createSpan({ cls: 'bases-chart-files-condition-property', text: this.details.xName });
			chip.createSpan({ cls: 'bases-chart-files-condition-operator', text: 'is' });
			chip.createSpan({ cls: 'bases-chart-files-condition-value', text: this.details.xValue }).title = this.details.xValue;
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
		search.setAttribute('aria-label', 'Find a file by name or path');
		this.listEl = this.contentEl.createDiv({ cls: 'bases-chart-files-list' });
		const table = this.listEl.createEl('table', { cls: 'bases-chart-files-table' });
		table.setAttribute('aria-label', `Files for ${this.details?.xValue ?? this.heading}`);
		if (this.hasGroups) table.addClass('bases-chart-files-table-grouped');
		const header = table.createEl('thead').createEl('tr');
		header.createEl('th', { cls: 'bases-chart-files-file-heading', text: 'File' }).setAttribute('scope', 'col');
		if (this.hasGroups) header.createEl('th', { cls: 'bases-chart-files-group-heading', text: 'Group' }).setAttribute('scope', 'col');
		header.createEl('th', { cls: 'bases-chart-files-value-heading', text: this.details?.yLabel || 'Value' }).setAttribute('scope', 'col');
		this.rowsEl = table.createEl('tbody', { cls: 'bases-chart-files-table-body' });
		this.footerEl = this.contentEl.createDiv({ cls: 'bases-chart-files-footer' });
		this.moreButton = this.footerEl.createEl('button', { cls: 'bases-chart-files-more', text: 'Load more' });
		this.moreButton.type = 'button';
		this.moreButton.addEventListener('click', () => this.appendPage()?.focus());
		search.addEventListener('input', () => this.filter(search.value));
		this.filter('');
		search.focus();
	}

	private filter(query: string): void {
		const needle = query.trim().toLocaleLowerCase();
		this.matches = needle ? this.indexedFiles.filter(item => item.searchPath.includes(needle)) : this.indexedFiles;
		this.shown = 0;
		this.rowsEl?.empty();
		if (this.listEl) this.listEl.scrollTop = 0;
		if (this.matches.length === 0) {
			const row = this.rowsEl?.createEl('tr');
			const cell = row?.createEl('td', { cls: 'bases-chart-files-empty', text: needle ? 'No matching files.' : 'No files.' });
			if (cell) cell.colSpan = this.hasGroups ? 3 : 2;
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
			row.setAttribute('title', file.path);
			const fileCell = row.createEl('td', { cls: 'bases-chart-file-cell' });
			const button = fileCell.createEl('button', { cls: 'bases-chart-file-open' });
			firstRow ??= button;
			button.type = 'button';
			button.setAttribute('aria-label', `Open ${file.path}`);
			const separator = file.path.lastIndexOf('/');
			const name = file.path.slice(separator + 1).replace(/\.[^.]+$/, '');
			const folder = separator >= 0 ? file.path.slice(0, separator) : '/';
			const details = button.createSpan({ cls: 'bases-chart-file-details' });
			details.createSpan({ cls: 'bases-chart-file-name', text: name });
			details.createSpan({ cls: 'bases-chart-file-folder', text: folder });
			if (this.hasGroups) row.createEl('td', { cls: 'bases-chart-file-group', text: file.group ?? '—' });
			row.createEl('td', { cls: 'bases-chart-file-value', text: String(file.value) });
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
