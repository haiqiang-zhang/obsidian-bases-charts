import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: [fileURLToPath(new URL('../src/aiCharts/aiChart.ts', import.meta.url))],
	bundle: true, write: false, format: 'cjs', platform: 'node',
	plugins: [{
		name: 'ai-chart-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\/aiChartSkill|\.\/ipc|\.\.\/utils\/renderer)$/ }, args => ({ path: args.path, namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: {
				obsidian: `export class BasesView { constructor(controller) { this.app = controller.app; } }
					export class Events { on() { return {}; } offref() {} }`,
				'./aiChartSkill': 'export const checkSkillStatus = () => runtime.checkStatus(); export const installSkill = async () => {};',
				'./ipc': 'export const writeAiViewIpc = async () => { runtime.ipcWrites++; }; export const clearAiViewIpc = async () => {};',
				'../utils/renderer': 'export class ChartRenderer { constructor() { return runtime.createRenderer(); } }',
			}[args.path] }));
		},
	}],
});

function harness(option) {
	const renderers = [];
	let resolveStatus;
	const status = new Promise(resolve => { resolveStatus = resolve; });
	const runtime = {
		checks: 0, ipcWrites: 0,
		checkStatus() { this.checks++; return status; },
		createRenderer() {
			const renderer = { options: [], messages: [], disposed: false,
				setOption(option) { this.options.push(option); },
				showMessage(...args) { this.messages.push(args); },
				dispose() { this.disposed = true; },
			};
			renderers.push(renderer);
			return renderer;
		},
	};
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, runtime });
	const container = {
		children: new Set(), addClass() {}, removeClass() {},
		createDiv() { const child = { remove: () => this.children.delete(child) }; this.children.add(child); return child; },
	};
	const view = new module.exports.AiChartView({ app: { vault: { adapter: {} }, workspace: { on: () => ({}), offref() {} } } }, container);
	const config = { name: 'Saved chart', get: () => option };
	return { view, config, container, renderers, runtime,
		setOption(value) { option = value; },
		async finishSetup() { resolveStatus({ skillInstalled: false, systemPromptConfigured: false }); await status; await Promise.resolve(); },
	};
}

const saved = { xAxis: { data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'bar', data: [2, 5] }] };

test('reopening a saved AI chart renders immediately without a Claudian setup check', () => {
	const h = harness(saved);
	h.view.onload();
	h.view.config = h.config;
	h.view.onDataUpdated();
	assert.equal(h.renderers[0].options[0], saved);
	assert.equal(h.runtime.checks, 0);
	h.view.onunload();
	assert.equal(h.container.children.size, 0);
	h.view.onload();
	assert.equal(h.renderers[1].options[0], saved);
	assert.equal(h.container.children.size, 1);
});

test('data delivered before load is rendered after the renderer is ready', () => {
	const h = harness(saved);
	assert.doesNotThrow(() => h.view.onDataUpdated());
	h.view.config = h.config;
	h.view.onDataUpdated();
	assert.equal(h.runtime.ipcWrites, 0);
	h.view.onload();
	assert.equal(h.renderers[0].options[0], saved);
});

test('new AI views still offer setup when Claudian is not configured', async () => {
	const h = harness();
	h.view.onload(); h.view.config = h.config; h.view.onDataUpdated();
	await h.finishSetup();
	assert.match(h.renderers[0].messages[0][0], /requires the Claudian/);
	assert.equal(h.renderers[0].messages[0][1].label, 'Set up AI Chart');
});

test('late setup results cannot replace a chart saved during initialization', async () => {
	const h = harness();
	h.view.onload(); h.view.config = h.config; h.view.onDataUpdated();
	h.setOption(saved); h.view.onDataUpdated();
	await h.finishSetup();
	assert.equal(h.renderers[0].options.at(-1), saved);
	assert.equal(h.renderers[0].messages.length, 0);
});

test('a pending setup check cannot affect an unloaded or reopened view', async () => {
	const h = harness();
	h.view.onload(); h.view.config = h.config; h.view.onDataUpdated();
	h.view.onunload();
	h.setOption(saved); h.view.onload();
	await h.finishSetup();
	assert.equal(h.renderers[0].disposed, true);
	assert.equal(h.renderers[0].messages.length, 0);
	assert.equal(h.renderers[1].options[0], saved);
	assert.equal(h.renderers[1].messages.length, 0);
});
