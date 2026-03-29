import { Plugin } from 'obsidian';
import { BAR_CHART_VIEW_TYPE, ChartView, LINE_CHART_VIEW_TYPE, PIE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from './ChartView';

export default class BasesChartsPlugin extends Plugin {
	onload(): void {
		this.registerBasesView(SCATTER_CHART_VIEW_TYPE, {
			name: 'Scatter Chart',
			icon: 'lucide-chart-scatter',
			factory: (controller, containerEl) => new ChartView(SCATTER_CHART_VIEW_TYPE, controller, containerEl),
			options: () => ChartView.getViewOptions(SCATTER_CHART_VIEW_TYPE),
		});

		this.registerBasesView(LINE_CHART_VIEW_TYPE, {
			name: 'Line Chart',
			icon: 'lucide-chart-line',
			factory: (controller, containerEl) => new ChartView(LINE_CHART_VIEW_TYPE, controller, containerEl),
			options: () => ChartView.getViewOptions(LINE_CHART_VIEW_TYPE),
		});

		this.registerBasesView(BAR_CHART_VIEW_TYPE, {
			name: 'Bar Chart',
			icon: 'lucide-chart-column',
			factory: (controller, containerEl) => new ChartView(BAR_CHART_VIEW_TYPE, controller, containerEl),
			options: () => ChartView.getViewOptions(BAR_CHART_VIEW_TYPE),
		});

		this.registerBasesView(PIE_CHART_VIEW_TYPE, {
			name: 'Pie Chart',
			icon: 'lucide-chart-pie',
			factory: (controller, containerEl) => new ChartView(PIE_CHART_VIEW_TYPE, controller, containerEl),
			options: () => ChartView.getViewOptions(PIE_CHART_VIEW_TYPE),
		});
	}

	onunload(): void {}
}
