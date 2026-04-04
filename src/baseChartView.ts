import type { EventRef, QueryController } from 'obsidian';
import { BasesView, Events } from 'obsidian';

export abstract class BaseChartView extends BasesView {
	abstract readonly type: string;
	readonly containerEl: HTMLElement;
	readonly events: Events;
	private cssChangeRef: EventRef | null = null;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this.containerEl = containerEl;
		this.events = new Events();
	}

	onload(): void {
		this.containerEl.addClass('bases-chart-view');
		this.onChartLoad();
		this.cssChangeRef = this.app.workspace.on('css-change', () => {
			this.events.trigger('data-updated');
		});
	}

	onunload(): void {
		if (this.cssChangeRef) {
			this.app.workspace.offref(this.cssChangeRef);
			this.cssChangeRef = null;
		}
		this.onChartUnload();
		this.containerEl.removeClass('bases-chart-view');
	}

	onDataUpdated(): void {
		this.events.trigger('data-updated');
	}

	async openFile(filePath: string, newTab: boolean): Promise<void> {
		const tFile = this.app.vault.getFileByPath(filePath);
		if (!tFile) return;
		const leaf = this.app.workspace.getLeaf(newTab ? 'tab' : false);
		if (leaf) {
			await leaf.openFile(tFile, { state: { mode: 'source' } });
		}
	}

	protected abstract onChartLoad(): void;
	protected abstract onChartUnload(): void;
}
