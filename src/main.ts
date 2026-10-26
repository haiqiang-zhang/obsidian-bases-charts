import { Plugin } from 'obsidian';
import type { BasesView } from 'obsidian';
import type { QueryController } from 'obsidian';
import { aiChartRegistration } from './aiCharts/aiChart';
import { barChartRegistration } from './dataCharts/charts/barChart';
import { lineChartRegistration } from './dataCharts/charts/lineChart';
import { pieChartRegistration } from './dataCharts/charts/pieChart';
import { scatterChartRegistration } from './dataCharts/charts/scatterChart';
import { ChartPaletteSettings } from './ui/chartPaletteSettings';
import { areaChartRegistration } from './dataCharts/charts/areaChart';
import { radarChartRegistration } from './dataCharts/charts/radarChart';

interface ChartRegistration {
	viewType: string;
	name: string;
	icon: string;
	createView: new (controller: QueryController, containerEl: HTMLElement) => BasesView;
	viewOptions: (config: import('obsidian').BasesViewConfig) => import('obsidian').BasesAllOptions[];
}

const chartRegistrations: ChartRegistration[] = [
	scatterChartRegistration,
	lineChartRegistration,
	areaChartRegistration,
	barChartRegistration,
	pieChartRegistration,
	radarChartRegistration,
	aiChartRegistration,
];

export default class BasesChartsPlugin extends Plugin {
	onload(): void {
		this.addChild(new ChartPaletteSettings(this.app));
		for (const reg of chartRegistrations) {
			this.registerBasesView(reg.viewType, {
				name: reg.name,
				icon: reg.icon,
				factory: (controller, containerEl) => new reg.createView(controller, containerEl),
				options: reg.viewOptions,
			});
		}
	}
}
