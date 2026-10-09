import type { App } from 'obsidian';
import type { EChartsOption } from 'echarts';
import type { ProcessedData } from '../dataCharts/data';
import { echarts } from '../echarts';
import { ChartTooltip } from '../ui/chartTooltip';
import type { ChartTooltipContext } from '../ui/chartTooltip';

export interface ChartViewLike {
	app: App;
	openFile(filePath: string, newTab: boolean): Promise<void>;
}

export class ChartRenderer {
	private chart: ReturnType<typeof echarts.init> | null = null;
	private tooltip: ChartTooltip | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private messageEl: HTMLElement | null = null;
	private option: EChartsOption | null = null;
	private tooltipContext: ChartTooltipContext | undefined;
	private unregisterMigration: () => void;
	private removeWindowListener: (() => void) | null = null;
	private initialResize: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private containerEl: HTMLElement,
		private view: ChartViewLike,
	) {
		this.initialize();
		this.unregisterMigration = containerEl.onWindowMigrated(() => {
			this.destroyChart();
			this.initialize();
			if (this.option) this.setOption(this.option, this.tooltipContext);
		});
	}

	private initialize(): void {
		this.chart = echarts.init(this.containerEl, undefined, { renderer: 'canvas' });
		this.tooltip = new ChartTooltip(this.containerEl, this.view, () => this.hideTooltip());
		this.resizeObserver = new ResizeObserver(() => {
			this.hideTooltip();
			this.chart?.resize();
		});
		this.resizeObserver.observe(this.containerEl);
		const win = this.containerEl.ownerDocument.defaultView;
		const onResize = () => this.hideTooltip();
		win?.addEventListener('resize', onResize);
		this.removeWindowListener = () => win?.removeEventListener('resize', onResize);

		this.chart.on('click', params => {
			// Bar columns (including their empty area) are handled once by ZRender.
			if (this.tooltipContext?.chartType === 'chart-bar') return;
			const raw = (params.data as { _raw?: ProcessedData })?._raw;
			if (!raw) return;
			if (raw.files.length && this.tooltipContext) {
				this.tooltip?.openFiles(raw, this.tooltipContext);
			} else if (raw.files.length === 1) {
				const event = params.event?.event as MouseEvent | undefined;
				void this.view.openFile(raw.files[0], !!(event?.ctrlKey || event?.metaKey));
			}
		});
		const zr = this.chart.getZr();
		zr.on('click', event => {
			const column = this.columnAt(event.offsetX, event.offsetY);
			if (column.length && this.tooltipContext) this.tooltip?.openFiles(column, this.tooltipContext);
		});
		zr.on('mousemove', event => {
			if (this.tooltipContext?.chartType === 'chart-bar') {
				zr.setCursorStyle(this.columnAt(event.offsetX, event.offsetY).length ? 'pointer' : 'default');
			}
		});
		// Resize after the host's first layout, without deferring a stale option or
		// moving configuration errors outside the caller's try/catch.
		this.initialResize = setTimeout(() => {
			this.initialResize = null;
			this.chart?.resize();
		}, 0);
	}

	private hideTooltip(): void {
		this.chart?.dispatchAction({ type: 'hideTip' });
	}

	private columnAt(x: number, y: number): ProcessedData[] {
		if (!this.chart || this.tooltipContext?.chartType !== 'chart-bar'
			|| !this.chart.containPixel({ gridIndex: 0 }, [x, y])) return [];
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		const count = axis?.type === 'category' ? axis.data?.length ?? 0 : 0;
		const ordinal = this.chart.convertFromPixel({ xAxisIndex: 0 }, x) as unknown;
		if (!count || typeof ordinal !== 'number' || !Number.isFinite(ordinal)) return [];
		const index = Math.max(0, Math.min(count - 1, Math.round(ordinal)));
		const series = Array.isArray(this.option?.series) ? this.option.series : [this.option?.series];
		const column: ProcessedData[] = [];
		for (const item of series) {
			const data = (item as { data?: { _raw?: ProcessedData | null }[] } | undefined)?.data?.[index];
			if (data?._raw) column.push(data._raw);
		}
		return column;
	}

	private tooltipAnchor(params: unknown): number[] | null {
		if (!this.chart || this.tooltipContext?.chartType === 'chart-pie') return null;
		const points = (Array.isArray(params) ? params : [params]) as {
			seriesIndex: number; dataIndex: number;
			data?: { value?: unknown; _raw?: ProcessedData | null };
		}[];
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		const pixels = points.flatMap(point => {
			const raw = point.data?._raw;
			if (!raw) return [];
			// Bar/line scalar data is aligned with every category. Scatter carries
			// its actual X in a pair because each group can omit categories.
			const value = axis?.type === 'category' && !Array.isArray(point.data?.value)
				? [point.dataIndex, raw.y] : point.data?.value;
			const pixel = this.chart!.convertToPixel({ seriesIndex: point.seriesIndex }, value as number[]) as unknown;
			return Array.isArray(pixel) && pixel.length === 2 && pixel.every(Number.isFinite) ? [pixel as number[]] : [];
		});
		return pixels.length ? [pixels[0][0], Math.min(...pixels.map(pixel => pixel[1]))] : null;
	}

	setOption(option: EChartsOption, context?: ChartTooltipContext): void {
		this.clearMessage();
		this.hideTooltip();
		const base = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
		const rendered = context && this.tooltip
			? { ...option, tooltip: this.tooltip.options(base ?? {}, context, params => this.tooltipAnchor(params)) }
			: option;
		this.chart?.setOption(rendered, { notMerge: true });
		this.option = option;
		this.tooltipContext = context;
	}

	showMessage(message: string, action?: { label: string; onClick: () => void }): void {
		this.clearMessage();
		this.hideTooltip();
		this.option = null;
		this.tooltipContext = undefined;
		this.chart?.clear();
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

	private destroyChart(): void {
		if (this.initialResize !== null) clearTimeout(this.initialResize);
		this.initialResize = null;
		this.removeWindowListener?.();
		this.removeWindowListener = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.tooltip?.dispose();
		this.tooltip = null;
		this.chart?.dispose();
		this.chart = null;
	}

	dispose(): void {
		this.unregisterMigration();
		this.destroyChart();
		this.clearMessage();
		this.option = null;
	}
}
