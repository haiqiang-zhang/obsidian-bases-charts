import { ButtonComponent, ColorComponent, Modal, Platform, TextComponent } from 'obsidian';
import type { App, EventRef, Events } from 'obsidian';
import { normalizeCustomColor } from '../dataCharts/groupColors';
import type { GroupColorChoice } from '../dataCharts/groupColors';

export interface GroupColorEntry {
	key: string;
	name: string;
	groupIndex: number;
	automaticColor: string;
	color: string;
	choice: GroupColorChoice | null;
}

export interface GroupColorEditorHost {
	app: App;
	events: Events;
	getGroupColorEntries(): GroupColorEntry[];
	setGroupColor(key: string, choice: GroupColorChoice | null): void;
	resetGroupColors(): void;
	hasGroupColors(): boolean;
}

let nextEditorId = 0;

/** A custom-color draft for one stable group key; only Apply saves it. */
export class GroupColorCustomModal extends Modal {
	private opened = false;
	private syncing = false;
	private committing = false;
	private draft = '#6B8EAD';
	private valid = true;
	private name = '';
	private groupLabel: HTMLElement | null = null;
	private controls: HTMLElement | null = null;
	private picker: ColorComponent | null = null;
	private hex: TextComponent | null = null;
	private error: HTMLElement | null = null;
	private applyButton: ButtonComponent | null = null;
	private updateRef: EventRef | null = null;
	private readonly errorId = `bases-chart-custom-color-error-${nextEditorId++}`;

	constructor(private host: GroupColorEditorHost, private key: string) {
		super(host.app);
		this.setTitle('Custom color');
		this.modalEl.addClass('bases-chart-custom-color-modal');
	}

	open(): void {
		if (this.opened) return;
		const entry = this.host.getGroupColorEntries().find(entry => entry.key === this.key);
		if (!entry) return;
		this.name = entry.name;
		this.draft = normalizeCustomColor(entry.color) ?? normalizeCustomColor(entry.automaticColor) ?? '#6B8EAD';
		this.valid = true;
		super.open();
		// Native Modal applies autofocus after onOpen. Phones start at Apply
		// without a keyboard; desktop users can immediately enter a hex value.
		if (Platform.isMobile) this.applyButton?.buttonEl.focus({ preventScroll: true });
		else {
			this.hex?.inputEl.focus({ preventScroll: true });
			this.hex?.inputEl.select();
		}
	}

	onOpen(): void {
		this.opened = true;
		this.contentEl.empty();
		this.contentEl.addClass('bases-chart-custom-color-content');
		this.groupLabel = this.contentEl.createDiv({ cls: 'bases-chart-custom-color-group', text: this.name });
		this.controls = this.contentEl.createDiv({ cls: 'bases-chart-custom-color-controls' });
		this.picker = new ColorComponent(this.controls).onChange(value => {
			if (!this.opened || this.syncing) return;
			const normalized = normalizeCustomColor(value);
			if (!normalized) return;
			this.draft = normalized;
			this.hex?.setValue(normalized);
			this.setValidity(true);
		});
		this.hex = new TextComponent(this.controls).setPlaceholder('Hex color').setValue(this.draft).onChange(value => {
			if (!this.opened) return;
			const normalized = normalizeCustomColor(value);
			this.setValidity(normalized !== null);
			if (!normalized) return;
			this.draft = normalized;
			this.syncPicker();
		});
		this.hex.inputEl.spellcheck = false;
		this.hex.inputEl.maxLength = 7;
		this.hex.inputEl.setAttribute('autocomplete', 'off');
		this.hex.inputEl.setAttribute('autocapitalize', 'off');
		this.hex.inputEl.addEventListener('blur', () => {
			if (this.opened && this.valid) this.hex?.setValue(this.draft);
		});
		this.hex.inputEl.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				this.apply();
			}
		});
		this.error = this.contentEl.createDiv({ cls: 'bases-chart-custom-color-error' });
		this.error.id = this.errorId;
		this.error.setAttribute('aria-live', 'polite');
		const footer = this.contentEl.createDiv({ cls: 'modal-button-container bases-chart-custom-color-footer' });
		new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
			if (this.opened) this.close();
		});
		this.applyButton = new ButtonComponent(footer).setButtonText('Apply').setCta().onClick(() => this.apply());
		this.syncPicker();
		this.updateLabels();
		this.updateRef = this.host.events.on('data-updated', () => {
			const entry = this.host.getGroupColorEntries().find(entry => entry.key === this.key);
			if (!entry) { this.close(); return; }
			this.name = entry.name;
			this.updateLabels();
		});
	}

	private updateLabels(): void {
		this.groupLabel?.setText(this.name);
		this.hex?.inputEl.setAttribute('aria-label', `Hex color for ${this.name}`);
		this.controls?.querySelector('input[type="color"]')?.setAttribute('aria-label', `Custom color for ${this.name}`);
	}

	private syncPicker(): void {
		if (!this.picker || normalizeCustomColor(this.picker.getValue()) === this.draft) return;
		// Native setValue emits onChange, and HTML color inputs use lowercase.
		this.syncing = true;
		try { this.picker.setValue(this.draft.toLowerCase()); }
		finally { this.syncing = false; }
	}

	private setValidity(valid: boolean): void {
		this.valid = valid;
		this.applyButton?.setDisabled(!valid);
		this.hex?.inputEl.setAttribute('aria-invalid', String(!valid));
		if (!valid) this.hex?.inputEl.setAttribute('aria-describedby', this.errorId);
		else this.hex?.inputEl.removeAttribute('aria-describedby');
		this.error?.setText(valid ? '' : 'Enter a hex color, such as #6B8EAD.');
	}

	private apply(): void {
		if (!this.opened || !this.valid || this.committing) return;
		if (!this.host.getGroupColorEntries().some(entry => entry.key === this.key)) { this.close(); return; }
		this.committing = true;
		try {
			this.host.setGroupColor(this.key, { type: 'custom', value: this.draft });
			this.close();
		} finally { this.committing = false; }
	}

	onClose(): void {
		this.opened = false;
		if (this.updateRef) this.host.events.offref(this.updateRef);
		this.updateRef = null;
		this.picker = null;
		this.hex = null;
		this.error = this.controls = this.groupLabel = null;
		this.applyButton = null;
		this.contentEl.empty();
	}
}
