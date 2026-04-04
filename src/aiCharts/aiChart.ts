import type { EChartsOption } from 'echarts';
import type { EventRef, QueryController } from 'obsidian';
import { BasesView, Events } from 'obsidian';
import { checkSkillInstalled, installSkill } from './aiChartSkill';
import { ChartRenderer } from './charts/chartRenderer';

export const AI_CHART_VIEW_TYPE = 'chart-ai';

const ECHARTS_OPTION_KEY = 'echarts-option';

export class AiChartView extends BasesView {
	readonly type = AI_CHART_VIEW_TYPE;
	readonly containerEl: HTMLElement;
	readonly events: Events;
	private renderer: ChartRenderer | null = null;
	private chartEl: HTMLElement | null = null;
	private cssChangeRef: EventRef | null = null;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this.containerEl = containerEl;
		this.events = new Events();
	}

	onload(): void {
		this.containerEl.addClass('bases-chart-view', 'bases-ai-chart-view');
		void this.initialize();

		this.cssChangeRef = this.app.workspace.on('css-change', () => {
			this.renderFromConfig();
		});
	}

	private async initialize(): Promise<void> {
		this.createRenderer();
		const installed = await checkSkillInstalled(this.app);
		if (!installed) {
			this.showSetup();
		} else {
			this.renderFromConfig();
		}
	}

	private showSetup(): void {
		if (!this.renderer) return;
		this.renderer.showMessage(
			'AI Chart requires the Claudian skill to generate chart configurations.',
			{
				label: 'Install AI Chart skill',
				onClick: () => {
					void installSkill(this.app).then(() => {
						this.renderFromConfig();
					});
				},
			},
		);
	}

	private createRenderer(): void {
		this.chartEl = this.containerEl.createDiv({ cls: 'bases-charts-plot-grid-item' });
		this.renderer = new ChartRenderer(this.chartEl, this);
	}

	private renderFromConfig(): void {
		if (!this.renderer) return;

		const option = this.config.get(ECHARTS_OPTION_KEY);
		if (!option || typeof option !== 'object') {
			this.renderer.showMessage(
				'No chart configuration. Use Claudian to generate a chart.',
			);
			return;
		}

		try {
			this.renderer.setOption(option as EChartsOption);
		} catch {
			this.renderer.showMessage('Invalid chart configuration.');
		}
	}

	async openFile(filePath: string, newTab: boolean): Promise<void> {
		const tFile = this.app.vault.getFileByPath(filePath);
		if (!tFile) return;
		const leaf = this.app.workspace.getLeaf(newTab ? 'tab' : false);
		if (leaf) {
			await leaf.openFile(tFile);
		}
	}

	onDataUpdated(): void {
		this.renderFromConfig();
	}

	onunload(): void {
		if (this.cssChangeRef) {
			this.app.workspace.offref(this.cssChangeRef);
			this.cssChangeRef = null;
		}
		this.renderer?.dispose();
		this.renderer = null;
		this.containerEl.removeClass('bases-chart-view', 'bases-ai-chart-view');
	}
}
