import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: [fileURLToPath(new URL('../src/utils/renderer.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'cjs',
	platform: 'node',
	plugins: [{
		name: 'renderer-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(\.\.\/echarts|\.\.\/ui\/chartTooltip)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === '../echarts'
					? 'export const echarts = { init: (...args) => runtime.initChart(...args) };'
					: 'export class ChartTooltip { constructor(...args) { return runtime.initTooltip(...args); } }',
			}));
		},
	}],
});

function createWindow() {
	const listeners = new Map();
	return {
		listeners,
		addEventListener: (name, callback) => listeners.set(name, callback),
		removeEventListener: (name, callback) => {
			assert.equal(listeners.get(name), callback, 'remove the listener from its original window');
			listeners.delete(name);
		},
	};
}

function harness() {
	const charts = [];
	const tooltips = [];
	const observers = [];
	const openedFiles = [];
	const timers = new Map();
	const cancelledTimers = [];
	let timerId = 0;
	let migration;
	let removedMigrations = 0;
	const window = createWindow();
	const container = {
		ownerDocument: { defaultView: window },
		onWindowMigrated(callback) {
			migration = callback;
			return () => { migration = null; removedMigrations++; };
		},
	};
	const view = { app: {}, openFile: async (...args) => { openedFiles.push(args); } };
	const runtime = {
		initChart(element, _theme, initOptions) {
			assert.equal(element, container);
			assert.equal(initOptions.renderer, 'canvas');
			const zr = {
				handlers: new Map(), cursorStyles: [],
				on(name, callback) { this.handlers.set(name, callback); },
				setCursorStyle(style) { this.cursorStyles.push(style); },
			};
			const chart = {
				calls: [], actions: [], handlers: new Map(), resizes: 0, disposed: 0, current: null,
				zr, containCalls: [], fromPixelCalls: [], toPixelCalls: [],
				contains: true, ordinal: 0,
				toPixel: (_finder, value) => value,
				on(name, callback) { this.handlers.set(name, callback); },
				getZr() { return this.zr; },
				containPixel(finder, point) {
					this.containCalls.push({ finder: { ...finder }, point: Array.from(point) });
					return this.contains;
				},
				convertFromPixel(finder, value) {
					this.fromPixelCalls.push({ finder: { ...finder }, value });
					return this.ordinal;
				},
				convertToPixel(finder, value) {
					this.toPixelCalls.push({ finder: { ...finder }, value: Array.isArray(value) ? Array.from(value) : value });
					return this.toPixel(finder, value);
				},
				setOption(option, flags) {
					if (option.error) throw option.error;
					this.calls.push({ option, flags });
					this.current = option;
				},
				dispatchAction(action) { this.actions.push(action.type); },
				resize() { this.resizes++; },
				clear() { this.current = null; },
				dispose() { this.disposed++; },
			};
			charts.push(chart);
			return chart;
		},
		initTooltip(element, host, hide) {
			assert.equal(element, container);
			assert.equal(host, view);
			const tooltip = {
				calls: [], opened: [], disposed: 0, hide,
				options(base, context, anchor) {
					this.calls.push({ base, context, anchor });
					return { ...base, testContext: context, tooltipIndex: tooltips.indexOf(this) };
				},
				openFiles(raw, context) { this.opened.push({ raw, context }); },
				dispose() { this.disposed++; },
			};
			tooltips.push(tooltip);
			return tooltip;
		},
	};
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, {
		module,
		exports: module.exports,
		runtime,
		setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
		clearTimeout(id) { cancelledTimers.push(id); timers.delete(id); },
		ResizeObserver: class {
			constructor(callback) { this.callback = callback; this.disconnected = 0; observers.push(this); }
			observe(element) { this.observed = element; }
			disconnect() { this.disconnected++; }
		},
	}, { filename: 'chart-renderer-under-test.cjs' });
	const renderer = new module.exports.ChartRenderer(container, view);
	return {
		renderer, charts, tooltips, observers, timers, cancelledTimers, window, openedFiles,
		get removedMigrations() { return removedMigrations; },
		flushTimers() {
			const pending = [...timers.values()];
			timers.clear();
			for (const callback of pending) callback();
		},
		migrate(nextWindow) {
			container.ownerDocument = { defaultView: nextWindow };
			migration?.();
		},
	};
}

test('first setOption errors propagate synchronously to the caller', () => {
	const state = harness();
	const error = new Error('Invalid ECharts configuration');
	assert.throws(() => state.renderer.setOption({ error }), thrown => thrown === error);
	assert.equal(state.charts[0].calls.length, 0);
	assert.doesNotThrow(() => state.flushTimers(), 'the deferred task only resizes and must not apply invalid options');
	assert.equal(state.charts[0].resizes, 1);
	state.renderer.dispose();
});

test('deferred first resize cannot overwrite a newer synchronous option', () => {
	const state = harness();
	const first = { series: [{ data: [1] }] };
	const latest = { series: [{ data: [9] }] };
	state.renderer.setOption(first);
	state.renderer.setOption(latest);
	assert.equal(state.charts[0].calls.length, 2);
	assert.equal(state.charts[0].current, latest);
	state.flushTimers();
	assert.equal(state.charts[0].resizes, 1);
	assert.equal(state.charts[0].calls.length, 2);
	assert.equal(state.charts[0].current, latest);
	assert.ok(state.charts[0].calls.every(call => call.flags.notMerge === true));
	state.renderer.dispose();
});

test('dispose cancels pending resize and releases chart, observer, tooltip, and window/migration listeners', () => {
	const state = harness();
	assert.equal(state.timers.size, 1);
	assert.equal(state.window.listeners.size, 1);
	state.renderer.dispose();
	assert.equal(state.timers.size, 0);
	assert.equal(state.cancelledTimers.length, 1);
	assert.equal(state.observers[0].disconnected, 1);
	assert.equal(state.tooltips[0].disposed, 1);
	assert.equal(state.charts[0].disposed, 1);
	assert.equal(state.window.listeners.size, 0);
	assert.equal(state.removedMigrations, 1);
	state.flushTimers();
	assert.equal(state.charts[0].resizes, 0);
	state.migrate(createWindow());
	assert.equal(state.charts.length, 1, 'disposed renderer must no longer react to window migration');
});

test('window migration rebuilds in the new window and reapplies the latest option/context', () => {
	const state = harness();
	const oldContext = { xName: 'Old X' };
	const context = { xName: 'Folder', yLabel: 'Count', groupNames: ['A', 'B'] };
	state.renderer.setOption({ tooltip: [{ trigger: 'axis' }], series: [{ data: [1] }] }, oldContext);
	const latest = { tooltip: { trigger: 'item' }, series: [{ data: [9] }] };
	state.renderer.setOption(latest, context);
	const nextWindow = createWindow();
	state.migrate(nextWindow);
	assert.equal(state.charts.length, 2);
	assert.equal(state.charts[0].disposed, 1);
	assert.equal(state.observers[0].disconnected, 1);
	assert.equal(state.tooltips[0].disposed, 1);
	assert.equal(state.window.listeners.size, 0);
	assert.equal(nextWindow.listeners.size, 1);
	assert.equal(state.cancelledTimers.length, 1);
	assert.equal(state.timers.size, 1, 'only the new chart should retain its initial resize');
	assert.equal(state.charts[1].calls.length, 1);
	assert.equal(state.charts[1].current.series, latest.series);
	assert.equal(state.tooltips[1].calls[0].base, latest.tooltip);
	assert.equal(state.tooltips[1].calls[0].context, context);
	assert.equal(state.charts[1].current.tooltip.testContext, context);
	assert.equal(state.charts[1].current.tooltip.tooltipIndex, 1);
	const raw = { files: ['a.md', 'b.md'] };
	state.charts[1].handlers.get('click')({ data: { _raw: raw } });
	assert.deepEqual(state.tooltips[1].opened, [{ raw, context }]);
	state.flushTimers();
	assert.equal(state.charts[0].resizes, 0);
	assert.equal(state.charts[1].resizes, 1);
	assert.equal(state.charts[1].calls.length, 1);
	state.renderer.dispose();
	assert.equal(nextWindow.listeners.size, 0);
	assert.equal(state.charts[1].disposed, 1);
});

function barFixture() {
	const state = harness();
	const first = { x: 'First', y: 2, group: 'A', files: ['first.md'] };
	const middleA = { x: 'Middle', y: 5, group: 'A', files: ['a.md', 'b.md'] };
	const middleB = { x: 'Middle', y: 0, group: 'B', files: ['zero.md'] };
	const last = { x: 'Last', y: 1, group: 'A', files: ['last.md'] };
	const placeholder = { value: 0, _raw: null };
	const point = raw => ({ value: raw.y, _raw: raw });
	const option = {
		xAxis: { type: 'category', data: ['First', 'Middle', 'Last'] },
		series: [
			{ type: 'bar', data: [point(first), point(middleA), point(last)] },
			{ type: 'bar', data: [placeholder, point(middleB), placeholder] },
			{ type: 'bar', data: [placeholder, placeholder, placeholder] },
		],
	};
	const context = { chartType: 'chart-bar', xName: 'Folder', yLabel: 'Count', groupNames: ['A', 'B', 'C'] };
	state.renderer.setOption(option, context);
	return { ...state, chart: state.charts[0], tooltip: state.tooltips[0], option, context, first, middleA, middleB, last };
}

test('a blank-space column click opens every real group at that X, including zero values', () => {
	const state = barFixture();
	state.chart.ordinal = 1;
	state.chart.zr.handlers.get('click')({ offsetX: 150, offsetY: 20, target: null, event: { offsetX: 999, offsetY: 999 } });
	assert.deepEqual(state.chart.containCalls, [{ finder: { gridIndex: 0 }, point: [150, 20] }]);
	assert.deepEqual(state.chart.fromPixelCalls, [{ finder: { xAxisIndex: 0 }, value: 150 }]);
	assert.equal(state.tooltip.opened.length, 1);
	const opened = state.tooltip.opened[0];
	assert.deepEqual(Array.from(opened.raw), [state.middleA, state.middleB], 'preserve group order and exclude placeholders');
	assert.equal(opened.raw[0].files, state.middleA.files, 'retain the complete file list');
	assert.equal(opened.context, state.context);
	assert.equal(state.openedFiles.length, 0);
	state.renderer.dispose();
});

test('a bar surface click opens one column modal, without a duplicate ECharts point modal', () => {
	const state = barFixture();
	state.chart.ordinal = 1;
	state.chart.handlers.get('click')({ data: { _raw: state.middleA } });
	state.chart.zr.handlers.get('click')({ offsetX: 150, offsetY: 100, target: {} });
	assert.equal(state.tooltip.opened.length, 1);
	assert.deepEqual(Array.from(state.tooltip.opened[0].raw), [state.middleA, state.middleB]);
	assert.equal(state.openedFiles.length, 0);
	state.renderer.dispose();
});

test('clicks outside the plot do not convert coordinates or open a modal', () => {
	const state = barFixture();
	state.chart.contains = false;
	state.chart.zr.handlers.get('click')({ offsetX: 15, offsetY: 15, target: null });
	assert.equal(state.chart.containCalls.length, 1);
	assert.equal(state.chart.fromPixelCalls.length, 0);
	assert.equal(state.tooltip.opened.length, 0);
	state.renderer.dispose();
});

test('plot-edge ordinals clamp to the nearest category while invalid ordinals are ignored', () => {
	const state = barFixture();
	for (const ordinal of [-1, 3]) {
		state.chart.ordinal = ordinal;
		state.chart.zr.handlers.get('click')({ offsetX: ordinal === -1 ? 50 : 570, offsetY: 100 });
	}
	assert.deepEqual(state.tooltip.opened.map(item => Array.from(item.raw)), [[state.first], [state.last]]);
	for (const ordinal of [NaN, Infinity, undefined, 'Middle']) {
		state.chart.ordinal = ordinal;
		state.chart.zr.handlers.get('click')({ offsetX: 150, offsetY: 100 });
	}
	assert.equal(state.tooltip.opened.length, 2);
	state.renderer.dispose();
});

test('column hover uses a pointer only over a populated column inside the plot', () => {
	const state = barFixture();
	const move = state.chart.zr.handlers.get('mousemove');
	state.chart.ordinal = 1;
	move({ offsetX: 150, offsetY: 20 });
	state.chart.contains = false;
	move({ offsetX: 150, offsetY: 400 });
	state.chart.contains = true;
	state.renderer.setOption({ ...state.option, series: [{ type: 'bar', data: [] }] }, state.context);
	move({ offsetX: 150, offsetY: 20 });
	assert.deepEqual(state.chart.zr.cursorStyles, ['pointer', 'default', 'default']);
	state.chart.zr.handlers.get('click')({ offsetX: 150, offsetY: 20 });
	assert.equal(state.tooltip.opened.length, 0);
	state.renderer.dispose();
});

test('a single-file point in a built-in non-bar chart still opens the file modal', () => {
	const state = harness();
	const context = { chartType: 'chart-line', xName: 'Date', yLabel: 'Count', groupNames: ['A'] };
	const raw = { x: '2026-10-09', y: 1, files: ['one.md'] };
	state.renderer.setOption({ series: [{ data: [{ value: 1, _raw: raw }] }] }, context);
	state.charts[0].handlers.get('click')({ data: { _raw: raw }, event: { event: { ctrlKey: true } } });
	assert.deepEqual(state.tooltips[0].opened, [{ raw, context }]);
	assert.equal(state.openedFiles.length, 0, 'built-in charts must not bypass the modal');
	state.charts[0].zr.handlers.get('click')({ offsetX: 150, offsetY: 100 });
	assert.equal(state.tooltips[0].opened.length, 1);
	assert.equal(state.charts[0].containCalls.length, 0);
	state.renderer.dispose();
});

test('category tooltip anchor comes from the column pixels and stays fixed as the pointer moves', () => {
	const state = barFixture();
	state.chart.toPixel = ({ seriesIndex }) => [[150, 120], [151, 80], [150, NaN]][seriesIndex];
	const anchor = state.tooltip.calls[0].anchor;
	const params = [
		{ seriesIndex: 0, dataIndex: 1, data: { value: 999, _raw: state.middleA } },
		{ seriesIndex: 1, dataIndex: 1, data: { value: 999, _raw: state.middleB } },
		{ seriesIndex: 2, dataIndex: 1, data: { value: 0, _raw: null } },
		{ seriesIndex: 2, dataIndex: 1, data: { value: 2, _raw: state.middleA } },
	];
	assert.deepEqual(Array.from(anchor(params)), [150, 80], 'use the first valid X and the visual top of real points');
	assert.deepEqual(state.chart.toPixelCalls, [
		{ finder: { seriesIndex: 0 }, value: [1, 5] },
		{ finder: { seriesIndex: 1 }, value: [1, 0] },
		{ finder: { seriesIndex: 2 }, value: [1, 5] },
	]);
	state.chart.ordinal = 1;
	state.chart.zr.handlers.get('mousemove')({ offsetX: 170, offsetY: 10 });
	assert.deepEqual(Array.from(anchor(params)), [150, 80]);
	state.chart.zr.handlers.get('mousemove')({ offsetX: 130, offsetY: 250 });
	assert.deepEqual(Array.from(anchor(params)), [150, 80]);
	assert.equal(anchor({ seriesIndex: 0, dataIndex: 1, data: { value: 0, _raw: null } }), null);
	state.renderer.dispose();
});

test('a sparse scatter group anchors to its actual category, not its position within the series', () => {
	const state = harness();
	const categories = ['A', 'B', 'C'];
	const context = { chartType: 'chart-scatter', xName: 'Category', yLabel: 'Value', groupNames: ['First', 'Second'] };
	const raw = { x: 'C', y: 7, files: ['second-c.md'], groupIndex: 1 };
	const point = { value: ['C', 7], _raw: raw };
	state.renderer.setOption({
		xAxis: { type: 'category', data: categories },
		series: [
			{ type: 'scatter', data: [{ value: ['A', 1] }, { value: ['B', 2] }] },
			{ type: 'scatter', data: [point] },
		],
	}, context);
	state.charts[0].toPixel = (_finder, [x, y]) => [
		165 + (typeof x === 'number' ? x : categories.indexOf(x)) * 150,
		345 - y * 40,
	];
	const anchor = state.tooltips[0].calls[0].anchor;
	assert.deepEqual(Array.from(anchor({ seriesIndex: 1, dataIndex: 0, data: point })), [465, 65],
		'the first point of the second group belongs to C, not A');
	assert.deepEqual(state.charts[0].toPixelCalls, [{ finder: { seriesIndex: 1 }, value: ['C', 7] }]);
	state.renderer.dispose();
});

test('numeric tooltip anchors convert the actual value pair, while pie uses no cartesian anchor', () => {
	const state = harness();
	const context = { chartType: 'chart-scatter', xName: 'X', yLabel: 'Y', groupNames: ['A'] };
	const raw = { x: 42, y: -5, files: ['point.md'] };
	state.renderer.setOption({ xAxis: { type: 'value' } }, context);
	state.charts[0].toPixel = () => [300, 240];
	const params = { seriesIndex: 2, dataIndex: 7, data: { value: [42, -5], _raw: raw } };
	assert.deepEqual(Array.from(state.tooltips[0].calls[0].anchor(params)), [300, 240]);
	assert.deepEqual(state.charts[0].toPixelCalls, [{ finder: { seriesIndex: 2 }, value: [42, -5] }]);
	state.renderer.setOption({ series: [{ type: 'pie' }] }, { ...context, chartType: 'chart-pie' });
	assert.equal(state.tooltips[0].calls[1].anchor(params), null);
	assert.equal(state.charts[0].toPixelCalls.length, 1);
	state.renderer.dispose();
});

test('options without a built-in tooltip context retain their original tooltip and column behavior', () => {
	const state = harness();
	const option = { xAxis: { type: 'category', data: ['A'] }, tooltip: { formatter: 'AI formatter', enterable: true } };
	state.renderer.setOption(option);
	assert.equal(state.charts[0].current, option);
	assert.equal(state.tooltips[0].calls.length, 0);
	state.charts[0].zr.handlers.get('click')({ offsetX: 150, offsetY: 100 });
	state.charts[0].zr.handlers.get('mousemove')({ offsetX: 150, offsetY: 100 });
	assert.equal(state.charts[0].containCalls.length, 0);
	assert.equal(state.charts[0].zr.cursorStyles.length, 0);
	assert.equal(state.tooltips[0].opened.length, 0);
	state.renderer.dispose();
});
