import { Platform, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { TooltipComponentOption } from 'echarts';
import type { ProcessedData } from '../dataCharts/data';
import { toCompactString } from '../utils/utils';
import { ChartFilesModal } from './chartFilesModal';
import type { ChartFileItem } from './chartFilesModal';
import { positionTooltip, tooltipMetrics, visibleTooltipBounds } from './tooltipGeometry';
import type { TooltipBounds } from './tooltipGeometry';

export interface ChartTooltipContext {
	xName: string;
	yLabel: string;
	groupNames: string[];
	chartType: string;
	showPercentages: boolean;
}

interface TooltipPoint {
	data?: { _raw?: ProcessedData | null };
	percent?: number;
	color?: unknown;
}

interface Selection {
	x: string;
	summary: string;
	files: ChartFileItem[];
	fileCount: number;
	groups: { name: string; value: string; color?: string }[];
	propertyLabel?: string;
	valueLabel?: string;
	groupLabel?: string;
	detailLabel?: string;
}

interface TooltipHost {
	app: App;
	openFile(path: string, newTab: boolean): Promise<void>;
}

export class ChartTooltip {
	private modal: ChartFilesModal | null = null;
	private touchSelection: { params: unknown; context: ChartTooltipContext } | null = null;
	private touchPreviewHeader: HTMLElement | null = null;
	private touchPreviewKey: string | null = null;

	constructor(
		private containerEl: HTMLElement,
		private view: TooltipHost,
		private hide: () => void,
		private previewEl?: HTMLElement,
	) {}

	usesTouchPreview(): boolean {
		const win = this.previewEl?.ownerDocument.defaultView;
		return !!this.previewEl && Platform.isPhone && !!win?.matchMedia('(orientation: portrait)').matches;
	}

	resetTouchPreview(): void {
		this.touchSelection = null;
		this.touchPreviewHeader = null;
		this.touchPreviewKey = null;
		if (!this.previewEl) return;
		this.previewEl.empty();
		this.previewEl.addClass('bases-chart-touch-preview');
		this.previewEl.setAttribute('role', 'region');
		this.previewEl.setAttribute('aria-label', 'Chart selection');
		const empty = this.previewEl.createDiv({ cls: 'bases-chart-touch-preview-empty' });
		setIcon(empty.createSpan({ attr: { 'aria-hidden': 'true' } }), 'touchpad');
		empty.createSpan({ text: 'Touch the chart to inspect data.' });
	}

	preview(params: unknown, context: ChartTooltipContext): boolean {
		if (!this.usesTouchPreview() || !this.previewEl) return false;
		const selected = this.selection(params, context, false);
		if (!selected) return false;
		this.touchSelection = { params, context };
		const visibleGroups = selected.groups.slice(0, 6);
		const hiddenGroups = selected.groups.length - visibleGroups.length;
		const property = `${selected.propertyLabel ?? context.xName} · ${selected.valueLabel ?? context.yLabel}`;
		const key = JSON.stringify([property, selected.x, visibleGroups, hiddenGroups, selected.detailLabel, selected.fileCount]);
		// Repeated moves in the same column must not replace the focused action or
		// announce the same selection again. Another chart may share this panel.
		if (this.touchPreviewKey === key && this.touchPreviewHeader?.parentElement === this.previewEl) return true;
		this.touchPreviewKey = key;
		this.previewEl.empty();
		this.previewEl.addClass('bases-chart-touch-preview');
		this.previewEl.setAttribute('role', 'region');
		this.previewEl.setAttribute('aria-label', 'Chart selection');
		const header = this.previewEl.createDiv({ cls: 'bases-chart-touch-preview-header',
			attr: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
		this.touchPreviewHeader = header;
		header.createDiv({ cls: 'bases-chart-touch-preview-property', text: property });
		header.createDiv({ cls: 'bases-chart-touch-preview-title', text: selected.x });
		const groups = this.previewEl.createDiv({ cls: 'bases-chart-touch-preview-groups' });
		for (const group of visibleGroups) {
			const row = groups.createDiv({ cls: 'bases-chart-touch-preview-row' });
			const swatch = row.createSpan({ cls: 'bases-chart-touch-preview-swatch', attr: { 'aria-hidden': 'true' } });
			if (group.color) swatch.style.setProperty('background-color', group.color);
			row.createSpan({ cls: 'bases-chart-touch-preview-name', text: group.name });
			row.createSpan({ cls: 'bases-chart-touch-preview-value', text: group.value });
		}
		const footer = this.previewEl.createDiv({ cls: 'bases-chart-touch-preview-footer' });
		footer.createSpan({ text: `${selected.fileCount} ${selected.fileCount === 1 ? 'file' : 'files'}${hiddenGroups
			? ` · +${hiddenGroups} more ${selected.detailLabel ?? 'groups'}` : ''}` });
		const button = footer.createEl('button', { text: 'View data', attr: { type: 'button', 'aria-haspopup': 'dialog' } });
		button.disabled = selected.fileCount === 0;
		button.addEventListener('click', () => {
			const current = this.touchSelection;
			if (!current) return;
			const fullSelection = this.selection(current.params, current.context, true);
			if (fullSelection?.fileCount) this.openSelection(fullSelection, current.context);
		});
		return true;
	}

	options(base: TooltipComponentOption, context: ChartTooltipContext,
		anchor?: (params: unknown) => number[] | null,
		plotBounds?: () => TooltipBounds | null): TooltipComponentOption {
		let fixed: { key: string; point: number[] } | undefined;
		return {
			...base,
			// Mobile inspection uses the fixed preview or native data sheet.
			// Floating hover previews remain available for desktop pointers.
			show: !Platform.isMobile,
			...(Platform.isMobile ? { triggerOn: 'none' as const } : {}),
			renderMode: 'html',
			appendTo: element => element.ownerDocument.body,
			confine: false,
			enterable: false,
			hideDelay: 0,
			transitionDuration: 0,
			className: 'bases-chart-tooltip-host',
			padding: 0,
			borderWidth: 0,
			backgroundColor: 'transparent',
			extraCssText: 'box-shadow:none;z-index:var(--layer-popover,30);white-space:normal;pointer-events:none;',
			formatter: params => {
				const available = this.visibleBounds(plotBounds);
				return plotBounds && !available ? '' : this.render(params, context, available);
			},
			position: (point, params, _dom, rect, size) => {
				const points = (Array.isArray(params) ? params : [params]);
				const key = points.map(p => `${p.seriesIndex}:${p.dataIndex}`).join('|');
				const dataAnchor = anchor?.(params);
				if (dataAnchor) fixed = { key, point: dataAnchor };
				else if (!fixed || fixed.key !== key) fixed = {
					key, point: rect ? [rect.x + rect.width / 2, rect.y + rect.height / 2] : [...point],
				};
				const win = this.containerEl.ownerDocument.defaultView;
				return positionTooltip(fixed.point, size.contentSize, this.containerEl.getBoundingClientRect(), {
					width: win?.innerWidth ?? size.viewSize[0],
					height: win?.innerHeight ?? size.viewSize[1],
				}, size.viewSize, context.chartType === 'chart-bar' ? 52 : 16, this.visibleBounds(plotBounds, size.viewSize));
			},
		};
	}

	private visibleBounds(plotBounds?: () => TooltipBounds | null, viewSize?: number[]): TooltipBounds | null {
		const plot = plotBounds?.();
		if (!plot) return null;
		const rect = this.containerEl.getBoundingClientRect();
		const win = this.containerEl.ownerDocument.defaultView;
		return visibleTooltipBounds(plot, rect, {
			width: win?.innerWidth ?? rect.width,
			height: win?.innerHeight ?? rect.height,
		}, viewSize ?? [this.containerEl.clientWidth, this.containerEl.clientHeight],
		this.containerEl.closest('.bases-data-chart-view')?.getBoundingClientRect());
	}

	private selection(params: unknown, context: ChartTooltipContext, includeFiles = true): Selection | null {
		const points = (Array.isArray(params) ? params : [params]) as TooltipPoint[];
		const valid = points.filter(point => point?.data?._raw);
		const first = valid[0]?.data?._raw;
		if (!first) return null;
		if (first.radar) {
			const { name, property, values } = first.radar;
			const files: ChartFileItem[] = [];
			let fileCount = 0;
			for (const { category, point } of values) {
				if (!point) continue;
				fileCount += point.files.length;
				if (includeFiles) point.files.forEach((path, index) => files.push({ path, value: point.fileValues[index], group: category }));
			}
			return {
				x: name, summary: `${property} · ${values.length} categories`, files, fileCount,
				propertyLabel: 'Series', valueLabel: property, groupLabel: context.xName, detailLabel: 'categories',
				groups: values.map(value => ({ name: value.category, value: value.value === null ? '—' : toCompactString(value.value),
					color: typeof valid[0].color === 'string' ? valid[0].color : undefined })),
			};
		}
		const x = first.x instanceof Date ? first.x.toLocaleString() : String(first.x);
		const formatValue = (value: number, percent?: number) => {
			const label = toCompactString(value);
			if (!context.showPercentages) return label;
			if (context.chartType === 'chart-pie' && typeof percent === 'number') return `${label} (${percent.toFixed(1)}%)`;
			return context.chartType === 'chart-bar' ? `${label}%` : label;
		};
		const files: ChartFileItem[] = [];
		let fileCount = 0;
		const groups = valid.map(point => {
			const raw = point.data!._raw!;
			const group = context.groupNames.length > 1 ? context.groupNames[raw.groupIndex] : undefined;
			fileCount += raw.files.length;
			if (includeFiles) for (let i = 0; i < raw.files.length; i++) files.push({ path: raw.files[i], value: raw.fileValues[i], group });
			return { name: group ?? context.yLabel, value: formatValue(raw.y, point.percent),
				color: typeof point.color === 'string' ? point.color : undefined };
		});
		const summary = valid.length === 1
			? `${context.groupNames.length > 1 ? `${groups[0].name} · ` : ''}${context.yLabel}: ${formatValue(first.y, valid[0].percent)}`
			: `${context.yLabel} · ${valid.length} groups`;
		return { x, summary, files, fileCount, groups };
	}

	private render(params: unknown, context: ChartTooltipContext, available: TooltipBounds | null): HTMLElement | string {
		const selected = this.selection(params, context, false);
		if (!selected) return '';
		// A mostly scrolled-out chart cannot contain a readable preview. Clicking
		// its remaining visible marks still opens the complete data modal.
		if (available && (available.width < 96 || available.height < 72)) return '';
		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView;
		const fontSize = win ? parseFloat(win.getComputedStyle(this.containerEl).fontSize) : 13;
		const metrics = tooltipMetrics(win?.innerWidth ?? 360, win?.innerHeight ?? 480, fontSize || 13, available);
		const ownerWindow = this.containerEl.win as Window & { createDiv: typeof createDiv };
		const root = ownerWindow.createDiv({ cls: 'bases-chart-tooltip' });
		root.style.setProperty('--chart-tooltip-width', `${metrics.width}px`);
		root.style.setProperty('--chart-tooltip-max-height', `${metrics.maxHeight}px`);
		root.style.setProperty('--chart-tooltip-row-height', `${metrics.rowHeight}px`);
		const header = root.createDiv({ cls: 'bases-chart-tooltip-header' });
		header.createDiv({ cls: 'bases-chart-tooltip-property', text: selected.propertyLabel ?? context.xName });
		header.createDiv({ cls: 'bases-chart-tooltip-title', text: selected.x }).title = selected.x;
		const list = root.createDiv({ cls: 'bases-chart-tooltip-preview' });
		const visible = Math.min(selected.groups.length, metrics.rowLimit);
		for (const group of selected.groups.slice(0, visible)) {
			const row = list.createDiv({ cls: 'bases-chart-tooltip-row' });
			const swatch = row.createSpan({ cls: 'bases-chart-tooltip-swatch' });
			if (group.color) swatch.style.setProperty('background-color', group.color);
			row.createSpan({ cls: 'bases-chart-tooltip-file-name', text: group.name }).title = group.name;
			row.createSpan({ cls: 'bases-chart-tooltip-file-value', text: group.value });
		}
		if (selected.fileCount) {
			const footer = root.createDiv({ cls: 'bases-chart-tooltip-footer' });
			if (visible < selected.groups.length) footer.createSpan({
				cls: 'bases-chart-tooltip-count', text: `+${selected.groups.length - visible} more ${selected.detailLabel ?? 'groups'}`,
			});
			footer.createSpan({ cls: 'bases-chart-tooltip-hint', text: 'Click to view data' });
		}
		return root;
	}

	openFiles(raw: ProcessedData | ProcessedData[], context: ChartTooltipContext): void {
		const selected = this.selection((Array.isArray(raw) ? raw : [raw]).map(item => ({ data: { _raw: item } })), context);
		if (selected) this.openSelection(selected, context);
	}

	private openSelection(selection: Selection, context: ChartTooltipContext): void {
		this.hide();
		this.modal?.close();
		this.modal = new ChartFilesModal(this.view.app, `${context.xName}: ${selection.x}`, selection.summary,
			selection.files, (path, newTab) => this.view.openFile(path, newTab),
			{ xName: selection.propertyLabel ?? context.xName, xValue: selection.x,
				yLabel: selection.valueLabel ?? context.yLabel, groupLabel: selection.groupLabel });
		this.modal.open();
	}

	dispose(): void {
		this.modal?.close();
		this.modal = null;
		this.touchSelection = null;
		this.touchPreviewHeader = null;
		this.touchPreviewKey = null;
	}
}
