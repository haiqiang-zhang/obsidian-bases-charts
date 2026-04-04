import { Plugin } from 'obsidian';
import type { BasesView } from 'obsidian';
import type { QueryController } from 'obsidian';
import { aiChartRegistration } from './aiCharts/aiChart';
import { barChartRegistration } from './dataCharts/charts/barChart';
import { lineChartRegistration } from './dataCharts/charts/lineChart';
import { pieChartRegistration } from './dataCharts/charts/pieChart';
import { scatterChartRegistration } from './dataCharts/charts/scatterChart';
import { DataChartView } from './dataCharts/dataChartView';
import { getSettingTooltips, injectAggregateDropdown, injectHelpIcons, injectYAxesHint, removeInjectedDOM, trackPropertyChevrons } from './ui/uiInjector';

interface ChartRegistration {
	viewType: string;
	name: string;
	icon: string;
	createView: new (controller: QueryController, containerEl: HTMLElement) => BasesView;
	viewOptions: () => import('obsidian').ViewOption[];
}

const chartRegistrations: ChartRegistration[] = [
	scatterChartRegistration,
	lineChartRegistration,
	barChartRegistration,
	pieChartRegistration,
	aiChartRegistration,
];

export default class BasesChartsPlugin extends Plugin {
	private menuObserver: MutationObserver | null = null;
	private activeDataViews = new Set<DataChartView>();
	private isProcessing = false;

	onload(): void {
		for (const reg of chartRegistrations) {
			this.registerBasesView(reg.viewType, {
				name: reg.name,
				icon: reg.icon,
				factory: (controller, containerEl) => {
					const view = new reg.createView(controller, containerEl);
					if (view instanceof DataChartView) {
						this.trackView(view);
					}
					return view;
				},
				options: reg.viewOptions,
			});
		}
	}

	private trackView(view: DataChartView): void {
		this.activeDataViews.add(view);
		this.startMenuObserver();
		view.register(() => {
			this.activeDataViews.delete(view);
		});
	}

	private stopMenuObserver(): void {
		if (this.menuObserver) {
			this.menuObserver.disconnect();
			this.menuObserver = null;
		}
		removeInjectedDOM();
	}

	private startMenuObserver(): void {
		if (this.menuObserver) return;

		this.menuObserver = new MutationObserver(() => {
			if (this.isProcessing) return;
			this.isProcessing = true;
			this.menuObserver?.disconnect();
			try {
				this.processMenus();
			} finally {
				this.menuObserver?.observe(document.body, { childList: true, subtree: true });
				this.isProcessing = false;
			}
		});
		this.menuObserver.observe(document.body, { childList: true, subtree: true });
	}

	private processMenus(): void {
		let activeView: DataChartView | null = null;
		for (const view of this.activeDataViews) {
			if (view.containerEl.hasClass('bases-chart-view')) {
				activeView = view;
				break;
			}
		}

		const openMenus = Array.from(document.querySelectorAll<HTMLElement>('.menu'));
		for (const menu of openMenus) {
			const configMenu = menu.querySelector<HTMLElement>('.view-config-menu');
			if (configMenu) {
				injectYAxesHint(configMenu);
			}
		}

		if (!activeView) {
			removeInjectedDOM();
			for (const menu of openMenus) {
				const title = menu.querySelector('.modal-title');
				if (title?.textContent === 'Y axes') {
					title.textContent = 'Properties';
					this.stopMenuObserver();
					return;
				}
			}
			return;
		}

		for (const menu of openMenus) {
			const modalTitle = menu.querySelector('.modal-title');
			if (modalTitle?.textContent === 'Properties' || modalTitle?.textContent === 'Y axes') {
				modalTitle.textContent = 'Y axes';
				trackPropertyChevrons(activeView, menu);
			}

			const configMenu = menu.querySelector<HTMLElement>('.view-config-menu');
			if (configMenu) {
				const tooltips = getSettingTooltips(activeView.type);
				if (Object.keys(tooltips).length > 0) {
					injectHelpIcons(configMenu, tooltips);
				}
			}

			const form = menu.querySelector<HTMLElement>('.bases-toolbar-menu-form');
			if (form) {
				injectAggregateDropdown(activeView, form);
			}
		}
	}

	onunload(): void {
		this.stopMenuObserver();
	}
}
