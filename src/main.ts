import { addIcon, Plugin, removeIcon } from 'obsidian';
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
import { GROUP_COLOR_PRESETS, getGroupColorIconId, resolveGroupColorChoice } from './dataCharts/groupColors';

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
		for (const preset of GROUP_COLOR_PRESETS) {
			for (const isDark of [false, true]) {
				const id = getGroupColorIconId(preset.id, isDark);
				const color = resolveGroupColorChoice({ type: 'preset', value: preset.id }, isDark);
				addIcon(id, `<circle cx="50" cy="50" r="34" fill="${color}" stroke="none"/>`);
				this.register(() => removeIcon(id));
			}
		}
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
