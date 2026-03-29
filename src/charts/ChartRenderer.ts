import type { EChartsOption } from 'echarts';
import type { EventRef } from 'obsidian';
import type { ProcessedData } from '../ChartData';
import type { ChartView } from '../ChartView';
import { echarts, resolveColors, type ResolvedColors } from './echarts-setup';
import { getFileDisplayName, toCompactString } from '../utils';

export class ChartRenderer {
	private chart: ReturnType<typeof echarts.init> | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private cssChangeRef: EventRef | null = null;
	private messageEl: HTMLElement | null = null;
	colors: ResolvedColors;

	constructor(
		private containerEl: HTMLElement,
		private view: ChartView,
	) {
		this.colors = resolveColors(containerEl);
		this.chart = echarts.init(containerEl, undefined, { renderer: 'canvas' });

		this.resizeObserver = new ResizeObserver(() => {
			this.chart?.resize();
		});
		this.resizeObserver.observe(containerEl);

		this.cssChangeRef = view.app.workspace.on('css-change', () => {
			this.colors = resolveColors(containerEl);
			view.events.trigger('data-updated');
		});

		// Click on data point: open file directly if single file
		this.chart.on('click', (params) => {
			const raw = (params.data as { _raw?: ProcessedData })?._raw;
			if (!raw) return;
			if (raw.files.length === 1) {
				const newTab = (params.event?.event as MouseEvent)?.ctrlKey || (params.event?.event as MouseEvent)?.metaKey || false;
				void this.view.openFile(raw.files[0], newTab);
			}
		});

		// Handle clicks on tooltip file links
		containerEl.addEventListener('click', (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const fileEl = target.closest<HTMLElement>('[data-file-path]');
			if (!fileEl) return;
			const filePath = fileEl.dataset.filePath;
			if (filePath) {
				const newTab = e.ctrlKey || e.metaKey;
				void this.view.openFile(filePath, newTab);
			}
		});
	}

	setOption(option: EChartsOption): void {
		this.clearMessage();
		this.chart?.setOption(option, { notMerge: true });
	}

	showMessage(message: string, action?: { label: string; onClick: () => void }): void {
		this.clearMessage();
		this.chart?.setOption({ xAxis: { show: false }, yAxis: { show: false }, series: [] }, { notMerge: true });

		const overlay = this.containerEl.createDiv({ cls: 'bases-charts-message-overlay' });
		overlay.createEl('p', { cls: 'bases-charts-message-text', text: message });
		if (action) {
			const btn = overlay.createEl('button', { cls: 'mod-cta', text: action.label });
			btn.addEventListener('click', action.onClick);
		}
		this.messageEl = overlay;
	}

	clearMessage(): void {
		this.messageEl?.remove();
		this.messageEl = null;
	}

	dispose(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.cssChangeRef) {
			this.view.app.workspace.offref(this.cssChangeRef);
			this.cssChangeRef = null;
		}
		this.chart?.dispose();
		this.chart = null;
	}

	static tooltipPosition(
		point: number[],
		_params: unknown,
		_dom: unknown,
		_rect: unknown,
		size: { contentSize: number[]; viewSize: number[] },
	): number[] {
		const [tooltipW, tooltipH] = size.contentSize;
		const [viewW] = size.viewSize;
		const margin = 8;

		// Center horizontally on x, clamp within view
		let x = point[0] - tooltipW / 2;
		x = Math.max(margin, Math.min(x, viewW - tooltipW - margin));

		// Place above the data point, with gap for labels
		let y = point[1] - tooltipH - 20;
		if (y < margin) {
			// If no room above, place below
			y = point[1] + 20;
		}

		return [x, y];
	}

	static formatTooltip(raw: ProcessedData, columnName: string, aggregateLabel: string): string {
		const { files, fileValues, y } = raw;

		if (files.length <= 1) {
			const name = files.length === 1 ? getFileDisplayName(files[0]) : '';
			return `<div class="bases-chart-tooltip">` +
				(name ? `<div class="bases-chart-tooltip-file" data-file-path="${files[0]}">${name}</div>` : '') +
				`<div class="bases-chart-tooltip-value">${columnName}: ${toCompactString(y)}</div>` +
				`</div>`;
		}

		let html = `<div class="bases-chart-tooltip">`;
		html += `<div class="bases-chart-tooltip-header">${aggregateLabel}: ${toCompactString(y)}</div>`;
		html += `<div class="bases-chart-tooltip-divider"></div>`;
		for (let i = 0; i < files.length; i++) {
			const name = getFileDisplayName(files[i]);
			const value = toCompactString(fileValues[i]);
			html += `<div class="bases-chart-tooltip-file" data-file-path="${files[i]}">` +
				`<span class="bases-chart-tooltip-file-name">${name}</span>` +
				`<span class="bases-chart-tooltip-file-value">${value}</span>` +
				`</div>`;
		}
		html += `</div>`;
		return html;
	}

	static formatAxisTooltip(
		params: { marker?: string; seriesName?: string; data: { _raw?: ProcessedData; value?: number } }[],
		columnName: string,
		aggregateLabel: string,
	): { html: string; hasFiles: boolean } {
		if (!Array.isArray(params) || params.length === 0) return { html: '', hasFiles: false };

		// Multiple series (group by): use simple display, no file links
		if (params.length > 1) {
			let html = `<div class="bases-chart-tooltip">`;
			for (const p of params) {
				const raw = p.data?._raw;
				if (!raw || raw.y === 0) continue;
				const marker = p.marker ?? '';
				html += `<div class="bases-chart-tooltip-group-row">`;
				html += `<span>${marker} ${p.seriesName ?? ''}</span>`;
				html += `<span class="bases-chart-tooltip-file-value">${toCompactString(raw.y)}</span>`;
				html += `</div>`;
			}
			html += `</div>`;
			return { html, hasFiles: false };
		}

		// Single series: show detailed file list
		const raw = params[0].data?._raw;
		if (!raw) return { html: '', hasFiles: false };
		return {
			html: ChartRenderer.formatTooltip(raw, columnName, aggregateLabel),
			hasFiles: raw.files.length > 0,
		};
	}
}
