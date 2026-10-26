import type { EChartsOption } from 'echarts';
import type { QueryController } from 'obsidian';
import { BaseChartView } from '../baseChartView';
import { checkSkillStatus, installSkill } from './aiChartSkill';
import { writeAiViewIpc, clearAiViewIpc } from './ipc';
import { ChartRenderer } from '../utils/renderer';

export const AI_CHART_VIEW_TYPE = 'chart-ai';

const ECHARTS_OPTION_KEY = 'echarts-option';

export class AiChartView extends BaseChartView {
	readonly type = AI_CHART_VIEW_TYPE;
	private renderer: ChartRenderer | null = null;
	private chartEl: HTMLElement | null = null;
	private initialized = false;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller, containerEl);
	}

	protected onChartLoad(): void {
		this.containerEl.addClass('bases-ai-chart-view');
		this.chartEl = this.containerEl.createDiv({ cls: 'bases-charts-plot-grid-item' });
		this.renderer = new ChartRenderer(this.chartEl, this);
		this.onDataUpdated();
	}

	protected onChartUnload(): void {
		void clearAiViewIpc(this.app.vault.adapter);
		this.renderer?.dispose();
		this.renderer = null;
		this.chartEl?.remove();
		this.chartEl = null;
		this.initialized = false;
		this.containerEl.removeClass('bases-ai-chart-view');
	}

	override onDataUpdated(): void {
		if (!this.renderer || !this.config) return;
		if (!this.initialized) {
			this.initialized = true;
			void writeAiViewIpc(this.app.vault.adapter, this.config.name);
			void this.initialize();
		} else {
			this.renderFromConfig();
		}
	}

	private async initialize(): Promise<void> {
		// Claudian is needed to generate a chart, not to reopen saved options.
		if (this.hasSavedOption()) {
			this.renderFromConfig();
			return;
		}
		const renderer = this.renderer;
		const status = await checkSkillStatus(this.app);
		if (!renderer || this.renderer !== renderer) return;
		if (this.hasSavedOption() || (status.skillInstalled && status.systemPromptConfigured)) {
			this.renderFromConfig();
		} else {
			this.showSetup(status.skillInstalled, status.systemPromptConfigured);
		}
	}

	private hasSavedOption(): boolean {
		const option = this.config?.get(ECHARTS_OPTION_KEY);
		return !!option && typeof option === 'object';
	}

	private showSetup(skillInstalled: boolean, systemPromptConfigured: boolean): void {
		if (!this.renderer) return;

		let message: string;
		if (!skillInstalled && !systemPromptConfigured) {
			message = 'AI Chart requires the Claudian skill and system prompt configuration.';
		} else if (!skillInstalled) {
			message = 'AI Chart requires the Claudian skill to be installed.';
		} else {
			message = 'AI Chart requires the Claudian system prompt to be configured.';
		}

		this.renderer.showMessage(message, {
			label: 'Set up AI Chart',
			onClick: () => {
				void installSkill(this.app).then(() => {
					this.renderFromConfig();
				}).catch((e: Error) => {
					this.renderer?.showMessage(e.message);
				});
			},
		});
	}

	private renderFromConfig(): void {
		if (!this.renderer || !this.config) return;

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
}

export const aiChartRegistration = {
	viewType: AI_CHART_VIEW_TYPE,
	name: 'AI Chart',
	icon: 'lucide-sparkles',
	createView: AiChartView,
	viewOptions: () => [] as never[],
};
