import type { EChartsOption } from 'echarts';
import { Menu } from 'obsidian';
import type { ProcessedData } from 'src/ChartData';
import type { ChartView } from 'src/ChartView';
import { echarts, resolveColors, type ResolvedColors } from 'src/charts/echarts-setup';
import { getFileDisplayName } from 'src/utils/utils';

export class ChartRenderer {
	private chart: ReturnType<typeof echarts.init> | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private themeObserver: MutationObserver | null = null;
	colors: ResolvedColors;

	constructor(
		private containerEl: HTMLElement,
		private view: ChartView,
	) {
		this.colors = resolveColors(containerEl);
		this.chart = echarts.init(containerEl, undefined, { renderer: 'canvas' });

		this.chart.on('click', params => {
			const raw = (params.data as { _raw?: ProcessedData })?._raw;
			if (!raw) return;
			this.handleClick(raw, params.event?.event as MouseEvent);
		});

		this.resizeObserver = new ResizeObserver(() => {
			this.chart?.resize();
		});
		this.resizeObserver.observe(containerEl);

		this.themeObserver = new MutationObserver(() => {
			this.colors = resolveColors(containerEl);
		});
		this.themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ['class'],
		});
	}

	setOption(option: EChartsOption): void {
		this.chart?.setOption(option, { notMerge: true });
	}

	dispose(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.themeObserver?.disconnect();
		this.themeObserver = null;
		this.chart?.dispose();
		this.chart = null;
	}

	private handleClick(data: ProcessedData, e?: MouseEvent): void {
		const { files, fileValues, y } = data;
		const newTab = e ? e.ctrlKey || e.metaKey : false;
		const columnName = this.view.processData().getChartName(data.chartIndex);

		if (files.length === 1) {
			void this.view.openFile(files[0], newTab);
		} else if (files.length > 1 && e) {
			const menu = new Menu();
			const aggregateLabel = this.view.getYAxisLabel(columnName).replace('↑ ', '');
			menu.addItem(item => {
				item.setTitle(`${aggregateLabel}: ${y}`).setIsLabel(true);
			});
			menu.addSeparator();
			for (let i = 0; i < files.length; i++) {
				const filePath = files[i];
				const value = fileValues[i];
				menu.addItem(item => {
					item.setTitle(`${getFileDisplayName(filePath)}  ·  ${columnName}: ${value}`)
						.setIcon('file-text')
						.onClick(() => {
							void this.view.openFile(filePath, newTab);
						});
				});
			}
			menu.showAtMouseEvent(e);
		}
	}
}
