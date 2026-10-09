import { Plugin } from 'obsidian';
import type { BasesView } from 'obsidian';
import type { QueryController } from 'obsidian';
import { aiChartRegistration } from './aiCharts/aiChart';
import { barChartRegistration } from './dataCharts/charts/barChart';
import { lineChartRegistration } from './dataCharts/charts/lineChart';
import { pieChartRegistration } from './dataCharts/charts/pieChart';
import { scatterChartRegistration } from './dataCharts/charts/scatterChart';

interface ChartRegistration {
	viewType: string;
	name: string;
	icon: string;
	createView: new (controller: QueryController, containerEl: HTMLElement) => BasesView;
	viewOptions: () => import('obsidian').BasesAllOptions[];
}

const chartRegistrations: ChartRegistration[] = [
	scatterChartRegistration,
	lineChartRegistration,
	barChartRegistration,
	pieChartRegistration,
	aiChartRegistration,
];

export default class BasesChartsPlugin extends Plugin {
	onload(): void {
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
