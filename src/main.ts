import { Plugin } from 'obsidian';
import { BAR_CHART_VIEW_TYPE, ChartView, LINE_CHART_VIEW_TYPE, PIE_CHART_VIEW_TYPE, SCATTER_CHART_VIEW_TYPE } from './chartView';
import { getSettingTooltips, injectAggregateDropdown, injectHelpIcons, removeInjectedDOM, trackPropertyChevrons } from './uiInjector';

export default class BasesChartsPlugin extends Plugin {
	private menuObserver: MutationObserver | null = null;
	private activeChartViews = new Set<ChartView>();
	private isProcessing = false;

	onload(): void {
		this.registerBasesView(SCATTER_CHART_VIEW_TYPE, {
			name: 'Scatter Chart',
			icon: 'lucide-chart-scatter',
			factory: (controller, containerEl) => {
				const view = new ChartView(SCATTER_CHART_VIEW_TYPE, controller, containerEl);
				this.trackView(view);
				return view;
			},
			options: () => ChartView.getViewOptions(SCATTER_CHART_VIEW_TYPE),
		});

		this.registerBasesView(LINE_CHART_VIEW_TYPE, {
			name: 'Line Chart',
			icon: 'lucide-chart-line',
			factory: (controller, containerEl) => {
				const view = new ChartView(LINE_CHART_VIEW_TYPE, controller, containerEl);
				this.trackView(view);
				return view;
			},
			options: () => ChartView.getViewOptions(LINE_CHART_VIEW_TYPE),
		});

		this.registerBasesView(BAR_CHART_VIEW_TYPE, {
			name: 'Bar Chart',
			icon: 'lucide-chart-column',
			factory: (controller, containerEl) => {
				const view = new ChartView(BAR_CHART_VIEW_TYPE, controller, containerEl);
				this.trackView(view);
				return view;
			},
			options: () => ChartView.getViewOptions(BAR_CHART_VIEW_TYPE),
		});

		this.registerBasesView(PIE_CHART_VIEW_TYPE, {
			name: 'Pie Chart',
			icon: 'lucide-chart-pie',
			factory: (controller, containerEl) => {
				const view = new ChartView(PIE_CHART_VIEW_TYPE, controller, containerEl);
				this.trackView(view);
				return view;
			},
			options: () => ChartView.getViewOptions(PIE_CHART_VIEW_TYPE),
		});
	}

	private trackView(view: ChartView): void {
		this.activeChartViews.add(view);
		this.startMenuObserver();
		view.register(() => {
			this.activeChartViews.delete(view);
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
		// Find the active chart view (if any)
		let activeView: ChartView | null = null;
		for (const view of this.activeChartViews) {
			if (view.containerEl.hasClass('bases-chart-view')) {
				activeView = view;
				break;
			}
		}

		if (!activeView) {
			removeInjectedDOM();
			const openMenus = document.querySelectorAll('.menu');
			for (const menu of Array.from(openMenus)) {
				const title = menu.querySelector('.modal-title');
				if (title?.textContent === 'Y axes') {
					title.textContent = 'Properties';
					this.stopMenuObserver();
					return;
				}
			}
			// Keep observer running until we've restored the Properties menu title
			return;
		}

		const openMenus = Array.from(document.querySelectorAll<HTMLElement>('.menu'));
		for (const menu of openMenus) {
			// Properties menu — rename title for mobile and track chevrons
			const modalTitle = menu.querySelector('.modal-title');
			if (modalTitle?.textContent === 'Properties' || modalTitle?.textContent === 'Y axes') {
				modalTitle.textContent = 'Y axes';
				trackPropertyChevrons(activeView, menu);
			}

			// View config menu — help icons
			const configMenu = menu.querySelector<HTMLElement>('.view-config-menu');
			if (configMenu) {
				const tooltips = getSettingTooltips(activeView.type);
				if (Object.keys(tooltips).length > 0) {
					injectHelpIcons(configMenu, tooltips);
				}
			}

			// Property edit form — aggregate dropdown
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
