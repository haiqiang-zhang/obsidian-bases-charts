import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	stdin: {
		contents: `
			export { ChartLayout } from './src/dataCharts/layout.ts';
			export { BaseChartView } from './src/baseChartView.ts';
			export { Events } from 'obsidian';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true,
	write: false,
	format: 'cjs',
	platform: 'node',
	plugins: [{
		name: 'layout-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\.\/utils\/renderer)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian' ? `
					export class BasesView { constructor(controller) { this.app = controller.app; } }
					export class Events {
						refs = new Set();
						on(name, callback) { const ref = { name, callback }; this.refs.add(ref); return ref; }
						offref(ref) { this.refs.delete(ref); }
						trigger(name) { for (const ref of this.refs) if (ref.name === name) ref.callback(); }
					}
					export function debounce(callback) {
						const schedule = () => runtime.pending.add(callback);
						schedule.cancel = () => runtime.pending.delete(callback);
						return schedule;
					}
					export class DateValue {}
					export class ListValue {}
					export class NumberValue {}
					export class StringValue {}
				` : 'export class ChartRenderer { constructor(...args) { return runtime.createRenderer(...args); } }',
			}));
		},
	}],
});

class Element {
	children = [];
	classes = new Set();
	parentElement = null;
	style = { setProperty() {} };
	win = { getComputedStyle: () => ({ getPropertyValue: () => '' }) };
	doc = { body: { classList: { contains: () => false } } };

	createDiv() {
		const child = new Element();
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	empty() { this.children = []; }
	addClass(name) { this.classes.add(name); }
	removeClass(name) { this.classes.delete(name); }
	toggleClass(name, enabled) { if (enabled) this.addClass(name); else this.removeClass(name); }
	remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
}

function harness() {
	const renderers = [];
	const pending = new Set();
	const runtime = {
		pending,
		createRenderer() {
			const renderer = { calls: [], setOption(...args) { this.calls.push(args); }, dispose() {} };
			renderers.push(renderer);
			return renderer;
		},
	};
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, runtime });
	const { ChartLayout, BaseChartView, Events } = module.exports;
	const workspace = new Events();
	class TestView extends BaseChartView {
		type = 'chart-bar';
		processCalls = 0;
		onChartLoad() { this.layout = new ChartLayout(this, this.containerEl); }
		onChartUnload() { this.layout.destroy(); }
		getYProperties() { return ['note.amount']; }
		getYAxisLabel() { return '↑ Amount'; }
		processData() {
			this.processCalls++;
			// Match the real processor's first access to query results.
			const entries = this.data.groupedData[0].entries;
			return {
				getChartIdentifiers: () => ['note.amount'],
				getGroupIdentifiers: () => ['All'],
				hasMultipleGroups: () => false,
				getGroupName: () => 'All',
				getChartName: () => 'Amount',
				getFlat: () => entries,
			};
		}
		buildOption(data) { return { series: [{ data: data.getFlat(0).map(entry => entry.y) }] }; }
	}
	const view = new TestView({ app: { workspace } }, new Element());
	view.onload();
	return {
		view, workspace, renderers,
		flush() {
			const callbacks = [...pending];
			pending.clear();
			for (const callback of callbacks) callback();
		},
	};
}

const config = {
	getAsPropertyId: () => 'file.folder',
	getDisplayName: () => 'Folder',
	get: () => false,
};
const data = { groupedData: [{ entries: [{ y: 42, isNumeric: true }] }] };

for (const missing of ['data', 'config']) {
	test(`theme update waits for missing ${missing}, then the first query update renders normally`, () => {
		const host = harness();
		const { view, workspace, renderers } = host;
		view.config = missing === 'config' ? undefined : config;
		view.data = missing === 'data' ? undefined : data;

		// Exercise the real BaseChartView css-change -> data-updated listener.
		workspace.trigger('css-change');
		assert.doesNotThrow(() => host.flush());
		assert.equal(view.processCalls, 0, 'an incomplete view must not process query results');
		assert.equal(renderers.length, 0, 'an incomplete view must not create a renderer');

		view.config = config;
		view.data = data;
		view.onDataUpdated();
		host.flush();
		assert.equal(view.processCalls, 1);
		assert.equal(renderers.length, 1);
		assert.equal(renderers[0].calls[0][0].series[0].data[0], 42);

		workspace.trigger('css-change');
		host.flush();
		assert.equal(renderers.length, 1, 'later theme changes reuse the renderer');
		assert.equal(renderers[0].calls.length, 2);
		view.onunload();
	});
}
