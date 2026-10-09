import type { App } from 'obsidian';
import type { TooltipComponentOption } from 'echarts';
import type { ProcessedData } from '../dataCharts/data';
import { toCompactString } from '../utils/utils';
import { ChartFilesModal } from './chartFilesModal';
import type { ChartFileItem } from './chartFilesModal';
import { positionTooltip, tooltipMetrics } from './tooltipGeometry';

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
}

interface TooltipHost {
	app: App;
	openFile(path: string, newTab: boolean): Promise<void>;
}

export class ChartTooltip {
	private modal: ChartFilesModal | null = null;

	constructor(
		private containerEl: HTMLElement,
		private view: TooltipHost,
		private hide: () => void,
	) {}

	options(base: TooltipComponentOption, context: ChartTooltipContext,
		anchor?: (params: unknown) => number[] | null): TooltipComponentOption {
		let fixed: { key: string; point: number[] } | undefined;
		return {
			...base,
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
			formatter: params => this.render(params, context),
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
				}, size.viewSize, context.chartType === 'chart-bar' ? 52 : 16);
			},
		};
	}

	private selection(params: unknown, context: ChartTooltipContext, includeFiles = true): Selection | null {
		const points = (Array.isArray(params) ? params : [params]) as TooltipPoint[];
		const valid = points.filter(point => point?.data?._raw);
		const first = valid[0]?.data?._raw;
		if (!first) return null;
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

	private render(params: unknown, context: ChartTooltipContext): HTMLElement | string {
		const selected = this.selection(params, context, false);
		if (!selected) return '';
		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView;
		const fontSize = win ? parseFloat(win.getComputedStyle(this.containerEl).fontSize) : 13;
		const metrics = tooltipMetrics(win?.innerWidth ?? 360, win?.innerHeight ?? 480, fontSize || 13);
		const grouped = context.groupNames.length > 1;
		const root = doc.createElement('div');
		root.className = 'bases-chart-tooltip';
		root.style.setProperty('--chart-tooltip-width', `${metrics.width}px`);
		root.style.setProperty('--chart-tooltip-max-height', `${metrics.maxHeight}px`);
		root.style.setProperty('--chart-tooltip-row-height', `${metrics.rowHeight}px`);
		const header = root.createDiv({ cls: 'bases-chart-tooltip-header' });
		header.createDiv({ cls: 'bases-chart-tooltip-property', text: context.xName });
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
			if (grouped && visible < selected.groups.length) footer.createSpan({
				cls: 'bases-chart-tooltip-count', text: `+${selected.groups.length - visible} more groups`,
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
			{ xName: context.xName, xValue: selection.x, yLabel: context.yLabel });
		this.modal.open();
	}

	dispose(): void {
		this.modal?.close();
		this.modal = null;
	}
}
