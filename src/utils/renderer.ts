import type { App } from 'obsidian';
import type { EChartsOption } from 'echarts';
import type { ProcessedData } from '../dataCharts/data';
import { echarts } from '../echarts';
import { ChartTooltip } from '../ui/chartTooltip';
import type { ChartTooltipContext } from '../ui/chartTooltip';
import { findPlotBounds } from '../ui/tooltipGeometry';
import type { TooltipBounds } from '../ui/tooltipGeometry';

export interface ChartViewLike {
	app: App;
	openFile(filePath: string, newTab: boolean): Promise<void>;
}

interface ColumnPoint {
	raw: ProcessedData;
	seriesIndex: number;
	dataIndex: number;
}

interface PointColumn {
	x: number;
	pixel: number;
	points: ColumnPoint[];
}

interface PointerEvent {
	offsetX: number;
	offsetY: number;
	target?: { cursor?: string } | null;
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
	private initialResize: { window: Window; id: number } | null = null;
	private plotBounds: TooltipBounds | null | undefined;
	private pointColumns: PointColumn[] | undefined;
	private handledClicks = new WeakSet<object>();

	private onColumnClick = (event: PointerEvent): void => {
		if (this.handledClicks.has(event) || !this.tooltipContext) return;
		const point = this.singlePointAt(event.offsetX, event.offsetY);
		const column = point ? [point.raw] : this.columnAt(event.offsetX, event.offsetY);
		if (!column.length) return;
		this.handledClicks.add(event);
		this.hideTooltip();
		this.tooltip?.openFiles(column, this.tooltipContext);
	};

	private onColumnMove = (event: PointerEvent): void => {
		const chart = this.chart;
		if (!chart) return;
		const type = this.tooltipContext?.chartType;
		if (type === 'chart-bar' || type === 'chart-area') {
			chart.getZr().setCursorStyle(this.columnAt(event.offsetX, event.offsetY).length ? 'pointer' : 'default');
		} else if (type === 'chart-line' || type === 'chart-scatter') {
			const point = this.singlePointAt(event.offsetX, event.offsetY);
			chart.getZr().setCursorStyle(point ? 'pointer' : event.target?.cursor ?? 'default');
			if (point) {
				// Axis-pointer and tooltip actions use the real datum, so the guide
				// and preview stay fixed while the cursor moves within its column.
				chart.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'mousemove',
					seriesIndex: point.seriesIndex, dataIndex: point.dataIndex });
				chart.dispatchAction({ type: 'showTip', seriesIndex: point.seriesIndex, dataIndex: point.dataIndex });
			} else if (!event.target && (type === 'chart-scatter'
				|| !chart.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]))) {
				this.hideTooltip();
			}
		}
	};

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
			this.plotBounds = undefined;
			this.pointColumns = undefined;
			this.chart?.resize();
		});
		this.resizeObserver.observe(this.containerEl);
		const win = this.containerEl.ownerDocument.defaultView;
		const onResize = () => this.hideTooltip();
		win?.addEventListener('resize', onResize);
		win?.addEventListener('scroll', onResize, true);
		this.removeWindowListener = () => {
			win?.removeEventListener('resize', onResize);
			win?.removeEventListener('scroll', onResize, true);
		};

		this.chart.on('click', params => {
			// Column selections (including area fills) are handled once by ZRender.
			if (['chart-bar', 'chart-area'].includes(this.tooltipContext?.chartType ?? '')) return;
			if (params.event && this.handledClicks.has(params.event)) return;
			const raw = (params.data as { _raw?: ProcessedData })?._raw;
			if (!raw) return;
			if (raw.files.length && this.tooltipContext) {
				if (params.event) this.handledClicks.add(params.event);
				this.hideTooltip();
				this.tooltip?.openFiles(raw, this.tooltipContext);
			} else if (raw.files.length === 1) {
				const event = params.event?.event as MouseEvent | undefined;
				void this.view.openFile(raw.files[0], !!(event?.ctrlKey || event?.metaKey));
			}
		});
		const zr = this.chart.getZr();
		zr.on('click', this.onColumnClick);
		zr.on('mousemove', this.onColumnMove);
		zr.on('globalout', () => this.hideTooltip());
		// Resize after the host's first layout, without deferring a stale option or
		// moving configuration errors outside the caller's try/catch.
		if (win) {
			this.initialResize = {
				window: win,
				id: win.setTimeout(() => {
					this.initialResize = null;
					this.plotBounds = undefined;
					this.pointColumns = undefined;
					this.chart?.resize();
				}, 0),
			};
		}
	}

	private hideTooltip(): void {
		if (['chart-line', 'chart-scatter'].includes(this.tooltipContext?.chartType ?? '')) {
			this.chart?.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
		}
		this.chart?.dispatchAction({ type: 'hideTip' });
	}

	private singlePointAt(x: number, y: number): ColumnPoint | null {
		const chart = this.chart;
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		if (!chart || !axis || !['chart-line', 'chart-scatter'].includes(this.tooltipContext?.chartType ?? '')
			|| !chart.containPixel({ gridIndex: 0 }, [x, y])) return null;
		const columns = this.pointColumns ??= this.indexPointColumns();
		let column: PointColumn | undefined;
		if (axis.type === 'category') {
			const ordinal = chart.convertFromPixel({ xAxisIndex: 0 }, x) as unknown;
			if (typeof ordinal !== 'number' || !Number.isFinite(ordinal)) return null;
			column = columns[Math.max(0, Math.min(columns.length - 1, Math.round(ordinal)))];
		} else {
			// Compare projected X positions, not data distances: log, time and
			// inverse axes must use the same visual columns as a category axis.
			let low = 0;
			let high = columns.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (columns[middle].pixel < x) low = middle + 1;
				else high = middle;
			}
			const before = columns[low - 1];
			const after = columns[low];
			if (!before || !after) column = before ?? after;
			else {
				const difference = Math.abs(x - before.pixel) - Math.abs(after.pixel - x);
				column = difference < 0 || (difference === 0 && before.x < after.x) ? before : after;
			}
		}
		const point = column?.points.length === 1 ? column.points[0] : undefined;
		return point?.raw.files.length ? point : null;
	}

	private indexPointColumns(): PointColumn[] {
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		if (!this.chart || !axis) return [];
		const categorical = axis.type === 'category';
		const categories = categorical ? axis.data ?? [] : [];
		const categoryIndices = new Map(categories.map((category, index) => [String(
			typeof category === 'object' && category !== null ? category.value : category), index]));
		const columns = new Map<number, PointColumn>();
		// Empty categories retain their own band and must never select a neighbor.
		categories.forEach((_, index) => columns.set(index, { x: index, pixel: index, points: [] }));
		const series = Array.isArray(this.option?.series) ? this.option.series : [this.option?.series];
		series.forEach((item, seriesIndex) => {
			const data = (item as { data?: { value?: unknown; _raw?: ProcessedData | null }[] } | undefined)?.data ?? [];
			data.forEach((datum, dataIndex) => {
				const pair: unknown[] | null = Array.isArray(datum.value) ? datum.value : null;
				let x: number;
				if (categorical) {
					x = pair ? categoryIndices.get(String(pair[0]))
						?? (typeof pair[0] === 'number' ? pair[0] : NaN) : dataIndex;
					if (!Number.isInteger(x) || x < 0 || x >= categories.length) return;
				} else {
					const value = pair?.[0];
					x = typeof value === 'number' ? value
						: axis.type === 'time' && typeof value === 'string' ? Date.parse(value) : NaN;
					if (!Number.isFinite(x)) return;
				}
				let column = columns.get(x);
				if (!column) {
					const pixel = this.chart!.convertToPixel({ xAxisIndex: 0 }, x) as unknown;
					if (typeof pixel !== 'number' || !Number.isFinite(pixel)) return;
					column = { x, pixel, points: [] };
					columns.set(x, column);
				}
				if (datum._raw && Number.isFinite(datum._raw.y)) {
					column.points.push({ raw: datum._raw, seriesIndex, dataIndex });
				}
			});
		});
		return Array.from(columns.values()).sort((a, b) => a.pixel - b.pixel);
	}

	private columnAt(x: number, y: number): ProcessedData[] {
		if (!this.chart || !['chart-bar', 'chart-area'].includes(this.tooltipContext?.chartType ?? '')
			|| !this.chart.containPixel({ gridIndex: 0 }, [x, y])) return [];
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		const ordinal = this.chart.convertFromPixel({ xAxisIndex: 0 }, x) as unknown;
		if (typeof ordinal !== 'number' || !Number.isFinite(ordinal)) return [];
		const series = Array.isArray(this.option?.series) ? this.option.series : [this.option?.series];
		let index: number;
		if (axis?.type === 'category') {
			const count = axis.data?.length ?? 0;
			if (!count) return [];
			index = Math.max(0, Math.min(count - 1, Math.round(ordinal)));
		} else if (this.tooltipContext?.chartType === 'chart-area') {
			// Area series share the same numeric/time coordinates, including gaps.
			const points = (series[0] as { data?: { value?: number[] }[] } | undefined)?.data ?? [];
			index = -1;
			let distance = Infinity;
			points.forEach((point, i) => {
				const delta = Math.abs((point.value?.[0] ?? NaN) - ordinal);
				if (delta < distance) { distance = delta; index = i; }
			});
			if (index < 0) return [];
		} else return [];
		const column: ProcessedData[] = [];
		for (const item of series) {
			const data = (item as { data?: { _raw?: ProcessedData | null }[] } | undefined)?.data?.[index];
			if (data?._raw) column.push(data._raw);
		}
		return column;
	}

	private tooltipAnchor(params: unknown): number[] | null {
		if (!this.chart || ['chart-pie', 'chart-radar'].includes(this.tooltipContext?.chartType ?? '')) return null;
		const points = (Array.isArray(params) ? params : [params]) as {
			seriesIndex: number; dataIndex: number;
			data?: { value?: unknown; _raw?: ProcessedData | null; _stackY?: number };
		}[];
		const axis = Array.isArray(this.option?.xAxis) ? this.option.xAxis[0] : this.option?.xAxis;
		const pixels = points.flatMap(point => {
			const raw = point.data?._raw;
			if (!raw) return [];
			// Bar/line scalar data is aligned with every category. Scatter carries
			// its actual X in a pair because each group can omit categories.
			const y = point.data?._stackY ?? raw.y;
			const value = axis?.type === 'category' && !Array.isArray(point.data?.value)
				? [point.dataIndex, y]
				: Array.isArray(point.data?.value) ? [point.data.value[0], y] : point.data?.value;
			const pixel = this.chart!.convertToPixel({ seriesIndex: point.seriesIndex }, value as number[]) as unknown;
			return Array.isArray(pixel) && pixel.length === 2 && pixel.every(Number.isFinite) ? [pixel as number[]] : [];
		});
		return pixels.length ? [pixels[0][0], Math.min(...pixels.map(pixel => pixel[1]))] : null;
	}

	private tooltipBounds(): TooltipBounds | null {
		const chart = this.chart;
		if (!chart) return null;
		// Labels can change the final grid bounds. Query the rendered plot instead
		// of estimating its edges from the configured padding or axis text width.
		if (this.plotBounds === undefined) this.plotBounds = findPlotBounds(chart.getWidth(), chart.getHeight(), point =>
			chart.containPixel({ gridIndex: 0 }, point));
		return this.plotBounds;
	}

	setOption(option: EChartsOption, context?: ChartTooltipContext): void {
		this.clearMessage();
		this.hideTooltip();
		const base = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
		let rendered = context && this.tooltip
			? { ...option, tooltip: this.tooltip.options(base ?? {}, context, params => this.tooltipAnchor(params),
				['chart-pie', 'chart-radar'].includes(context.chartType) ? undefined : () => this.tooltipBounds()) }
			: option;
		if (context && ['chart-line', 'chart-scatter'].includes(context.chartType) && option.xAxis) {
			const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
			rendered = { ...rendered, xAxis: axes.map((axis, index) => index ? axis : { ...axis, axisPointer: {
				...axis.axisPointer, show: true, status: 'hide', type: 'line', snap: true,
				triggerTooltip: context.chartType === 'chart-line',
				label: { show: false }, lineStyle: { ...base?.axisPointer?.lineStyle, type: 'dashed', width: 1 },
			} }) };
		}
		this.plotBounds = undefined;
		this.pointColumns = undefined;
		this.chart?.setOption(rendered, { notMerge: true });
		this.option = option;
		this.tooltipContext = context;
		// ECharts registers its native tooltip handlers during setOption. Run
		// ours afterwards, otherwise its blank-space hideTip wins over showTip.
		const zr = this.chart?.getZr();
		zr?.off('mousemove', this.onColumnMove);
		zr?.on('mousemove', this.onColumnMove);
		zr?.off('click', this.onColumnClick);
		zr?.on('click', this.onColumnClick);
	}

	showMessage(message: string, action?: { label: string; onClick: () => void }): void {
		this.clearMessage();
		this.hideTooltip();
		this.option = null;
		this.tooltipContext = undefined;
		this.pointColumns = undefined;
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
		// The element may already belong to a different window during migration.
		if (this.initialResize) this.initialResize.window.clearTimeout(this.initialResize.id);
		this.initialResize = null;
		this.removeWindowListener?.();
		this.removeWindowListener = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.tooltip?.dispose();
		this.tooltip = null;
		this.chart?.dispose();
		this.chart = null;
		this.plotBounds = undefined;
		this.pointColumns = undefined;
	}

	dispose(): void {
		this.unregisterMigration();
		this.destroyChart();
		this.clearMessage();
		this.option = null;
	}
}
