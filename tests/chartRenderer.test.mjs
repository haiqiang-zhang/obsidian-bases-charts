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
	const timers = new Map();
	const cancelledTimers = [];
	const observers = [];
	let timerId = 0;
	return {
		listeners, timers, cancelledTimers, observers,
		ResizeObserver: class {
			constructor(callback) { this.callback = callback; this.disconnected = 0; observers.push(this); }
			observe(element) { this.observed = element; }
			disconnect() { this.disconnected++; }
		},
		setTimeout(callback) {
			const id = ++timerId;
			timers.set(id, callback);
			return id;
		},
		clearTimeout(id) { cancelledTimers.push(id); timers.delete(id); },
		flushTimers() {
			const pending = [...timers.values()];
			timers.clear();
			for (const callback of pending) callback();
		},
		addEventListener: (name, callback) => listeners.set(name, callback),
		removeEventListener: (name, callback) => {
			assert.equal(listeners.get(name), callback, 'remove the listener from its original window');
			listeners.delete(name);
		},
	};
}

function harness(withPreview = false) {
	const charts = [];
	const tooltips = [];
	const openedFiles = [];
	let migration;
	let removedMigrations = 0;
	const window = createWindow();
	const container = {
		listeners: new Map(),
		addEventListener(name, fn) { this.listeners.set(name, fn); },
		removeEventListener(name) { this.listeners.delete(name); },
		getBoundingClientRect() { return {left: 0, top: 0}; },
		clientWidth: 700, clientHeight: 400,
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
				handlers: new Map(), cursorStyles: [], registrations: [],
				on(name, callback) { this.handlers.set(name, callback); this.registrations.push(name); },
				off(name, callback) { if (this.handlers.get(name) === callback) this.handlers.delete(name); },
				setCursorStyle(style) { this.cursorStyles.push(style); },
			};
			const chart = {
				calls: [], actions: [], actionPayloads: [], handlers: new Map(), resizes: 0, disposed: 0, current: null,
				zr, containCalls: [], fromPixelCalls: [], toPixelCalls: [],
				contains: true, ordinal: 0, width: 700, height: 400,
				getVisual() { return '#123456'; },
				getWidth() { return this.width; },
				getHeight() { return this.height; },
				toPixel: (_finder, value) => value,
				on(name, callback) { this.handlers.set(name, callback); },
				getZr() { return this.zr; },
				containPixel(finder, point) {
					this.containCalls.push({ finder: { ...finder }, point: Array.from(point) });
					return typeof this.contains === 'function' ? this.contains(point) : this.contains;
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
					zr.registrations.push('setOption');
					this.current = option;
				},
				dispatchAction(action) { this.actions.push(action.type); this.actionPayloads.push({ ...action }); },
				resize() {
					this.resizes++;
					this.width = container.clientWidth;
					this.height = container.clientHeight;
				},
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
				calls: [], opened: [], disposed: 0, hide, previews: [], touchPreview: false, resets: 0, selection: null,
				usesTouchPreview() { return this.touchPreview; },
				preview(params, context) { this.selection = { params, context }; this.previews.push(this.selection); return true; },
				resetTouchPreview() { this.resets++; this.selection = null; },
				options(base, context, anchor, bounds) {
					this.calls.push({ base, context, anchor, bounds });
					return { ...base, show: !this.touchPreview, triggerOn: this.touchPreview ? 'none' : base.triggerOn,
						testContext: context, tooltipIndex: tooltips.indexOf(this) };
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
		setTimeout() { assert.fail('renderer timers must be created in the owning window'); },
		clearTimeout() { assert.fail('renderer timers must be cancelled in their original window'); },
		ResizeObserver: class {
			constructor() { assert.fail('resize observers must be created in the owning window'); }
		},
	}, { filename: 'chart-renderer-under-test.cjs' });
	const renderer = new module.exports.ChartRenderer(container, view, withPreview ? {} : undefined);
	return {
		renderer, charts, tooltips, observers: window.observers, window, container, openedFiles,
		get removedMigrations() { return removedMigrations; },
		flushTimers() {
			container.ownerDocument.defaultView.flushTimers();
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

test('popout zoom resizes the canvas even before an observer callback is delivered', () => {
	const state = harness();
	state.flushTimers();
	assert.equal(state.charts[0].getWidth(), 700);
	state.container.clientWidth = 933;
	state.container.clientHeight = 533;
	state.window.listeners.get('resize')();
	state.flushTimers();
	assert.equal(state.charts[0].getWidth(), 933, 'canvas must fill the wider CSS viewport after zooming out');
	assert.equal(state.charts[0].getHeight(), 533);
	assert.ok(state.charts[0].actions.includes('hideTip'));
	assert.ok(state.observers[0] instanceof state.window.ResizeObserver);
	assert.equal(state.observers[0].observed, state.container);
	state.container.clientWidth = 700;
	state.container.clientHeight = 400;
	state.observers[0].callback();
	state.flushTimers();
	assert.equal(state.charts[0].getWidth(), 700, 'the owning-window observer must also follow pane resizes');
	state.renderer.dispose();
});

test('observer delivery defers DOM writes, coalesces bursts, and ignores unchanged dimensions', () => {
	const state = harness();
	state.flushTimers();
	const chart = state.charts[0];
	state.container.clientWidth = 900;
	for (let index = 0; index < 5; index++) state.observers[0].callback();
	state.window.listeners.get('resize')();
	assert.equal(chart.resizes, 1, 'an observer callback must not synchronously mutate chart DOM');
	assert.equal(state.window.timers.size, 1, 'observer and window events share one pending resize');
	state.container.clientWidth = 850;
	state.flushTimers();
	assert.equal(chart.getWidth(), 850, 'the scheduled resize reads the final dimensions');
	assert.equal(chart.resizes, 2);
	state.observers[0].callback();
	state.flushTimers();
	assert.equal(chart.resizes, 2, 'notifications caused by the chart itself must not cause another resize');
	state.container.clientWidth = 800;
	state.observers[0].callback();
	state.renderer.dispose();
	assert.equal(state.window.timers.size, 0, 'dispose cancels a queued observer resize');
	state.flushTimers();
	assert.equal(chart.resizes, 2);
});

test('dispose cancels pending resize and releases chart, observer, tooltip, and window/migration listeners', () => {
	const state = harness();
	assert.equal(state.window.timers.size, 1);
	assert.equal(state.window.listeners.size, 2);
	state.renderer.dispose();
	assert.equal(state.window.timers.size, 0);
	assert.deepEqual(state.window.cancelledTimers, [1]);
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
	state.tooltips[0].touchPreview = true;
	const oldContext = { xName: 'Old X' };
	const context = { xName: 'Folder', yLabel: 'Count', groupNames: ['A', 'B'], chartType: 'chart-line' };
	state.renderer.setOption({ tooltip: [{ trigger: 'axis' }], series: [{ data: [1] }] }, oldContext);
	const latest = { tooltip: { trigger: 'item' }, series: [{ type: 'line', emphasis: { focus: 'series' }, data: [9] }] };
	state.renderer.setOption(latest, context);
	assert.equal(state.charts[0].current.tooltip.show, false);
	assert.equal(state.charts[0].current.series[0].emphasis.disabled, true);
	const nextWindow = createWindow();
	let unrelatedCalls = 0;
	const unrelatedTimer = nextWindow.setTimeout(() => { unrelatedCalls++; });
	assert.equal(unrelatedTimer, 1, 'different windows can assign the same timer ID');
	state.migrate(nextWindow);
	assert.equal(state.charts.length, 2);
	assert.equal(state.charts[0].disposed, 1);
	assert.equal(state.observers[0].disconnected, 1);
	assert.equal(state.tooltips[0].disposed, 1);
	assert.equal(state.window.listeners.size, 0);
	assert.equal(nextWindow.listeners.size, 2);
	assert.equal(nextWindow.observers.length, 1);
	assert.ok(nextWindow.observers[0] instanceof nextWindow.ResizeObserver, 'migration must use the destination observer constructor');
	assert.equal(nextWindow.observers[0].observed, state.container);
	assert.deepEqual(state.window.cancelledTimers, [1]);
	assert.equal(state.window.timers.size, 0, 'the previous window must not retain a stale resize');
	assert.equal(nextWindow.timers.size, 2, 'the new resize must coexist with the unrelated timer');
	assert.ok(nextWindow.timers.has(unrelatedTimer), 'migration must not cancel the same ID in the destination window');
	assert.deepEqual(nextWindow.cancelledTimers, []);
	assert.equal(state.charts[1].calls.length, 1);
	assert.equal(state.charts[1].current.series, latest.series);
	assert.equal(state.tooltips[1].calls[0].base, latest.tooltip);
	assert.equal(state.tooltips[1].calls[0].context, context);
	assert.equal(state.charts[1].current.tooltip.testContext, context);
	assert.equal(state.charts[1].current.tooltip.tooltipIndex, 1);
	assert.equal(state.charts[1].current.tooltip.show, true, 'the destination tooltip selects its own interaction mode');
	assert.equal(state.charts[1].current.series[0].emphasis.focus, 'series');
	assert.equal(state.charts[1].current.series[0].emphasis.disabled, undefined);
	const raw = { files: ['a.md', 'b.md'] };
	state.charts[1].handlers.get('click')({ data: { _raw: raw } });
	assert.deepEqual(state.tooltips[1].opened, [{ raw, context }]);
	state.flushTimers();
	assert.equal(unrelatedCalls, 1);
	assert.equal(state.charts[0].resizes, 0);
	assert.equal(state.charts[1].resizes, 1);
	assert.equal(state.charts[1].calls.length, 1);
	state.renderer.dispose();
	assert.equal(nextWindow.listeners.size, 0);
	assert.equal(state.charts[1].disposed, 1);
	assert.deepEqual(nextWindow.cancelledTimers, [], 'an already-fired resize must not be cancelled again');
});

test('disposing after migration clears only the pending timer in the window that created it', () => {
	const state = harness();
	const nextWindow = createWindow();
	let unrelatedCalls = 0;
	const destinationTimer = nextWindow.setTimeout(() => { unrelatedCalls++; });
	state.migrate(nextWindow);
	const originalTimer = state.window.setTimeout(() => { unrelatedCalls++; });
	assert.equal(originalTimer, 2, 'the original window can reuse the new resize timer ID');
	state.renderer.dispose();
	assert.deepEqual(state.window.cancelledTimers, [1]);
	assert.deepEqual(nextWindow.cancelledTimers, [2]);
	assert.ok(state.window.timers.has(originalTimer));
	assert.ok(nextWindow.timers.has(destinationTimer));
	state.window.flushTimers();
	nextWindow.flushTimers();
	assert.equal(unrelatedCalls, 2);
	assert.deepEqual(state.charts.map(chart => chart.resizes), [0, 0]);
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

test('tooltip bounds follow the rendered Cartesian plot after resize and scrolling hides the old body tooltip', () => {
	const state = barFixture();
	const chart = state.chart;
	let plot = { left: 50, top: 40, right: 680, bottom: 320 };
	chart.contains = ([x, y]) => x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom;
	const bounds = state.tooltip.calls[0].bounds;
	const first = bounds();
	assert.ok(Math.abs(first.left - 50) < 0.25 && Math.abs(first.top + first.height - 320) < 0.25);
	const calls = chart.containCalls.length;
	bounds();
	assert.equal(chart.containCalls.length, calls, 'moving within a plotted series reuses the measured plot');
	plot = { left: 70, top: 55, right: 600, bottom: 280 };
	state.observers[0].callback();
	state.flushTimers();
	const resized = bounds();
	assert.ok(Math.abs(resized.left - 70) < 0.25 && Math.abs(resized.top + resized.height - 280) < 0.25);
	const actions = chart.actions.length;
	state.window.listeners.get('scroll')();
	assert.equal(chart.actions.length, actions + 1);
	assert.equal(chart.actions.at(-1), 'hideTip');
	state.renderer.setOption({ series: [{ type: 'pie' }] }, { ...state.context, chartType: 'chart-pie' });
	assert.equal(state.tooltip.calls.at(-1).bounds, undefined, 'pie keeps its separate viewport placement');
	state.renderer.dispose();
});

test('radar bypasses Cartesian coordinate and bounds queries while retaining polygon activation', () => {
	const state = harness();
	const context = { chartType: 'chart-radar', xName: 'Department', yLabel: 'Values', groupNames: [] };
	const raw = { x: 'Budget', y: 0, files: ['sales.md'], radar: { name: 'Budget', property: 'Budget', values: [] } };
	const point = { value: [2, 4, 6], _raw: raw };
	state.renderer.setOption({ radar: { indicator: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }, series: [{ type: 'radar', data: [point] }] }, context);
	const tooltip = state.tooltips[0];
	assert.equal(tooltip.calls[0].anchor({ seriesIndex: 0, dataIndex: 0, data: point }), null);
	assert.equal(tooltip.calls[0].bounds, undefined);
	assert.equal(state.charts[0].toPixelCalls.length, 0);
	assert.equal(state.charts[0].containCalls.length, 0);
	state.charts[0].handlers.get('click')({ data: point });
	state.charts[0].zr.handlers.get('click')({ offsetX: 100, offsetY: 100 });
	assert.deepEqual(tooltip.opened, [{ raw, context }]);
	assert.equal(state.charts[0].containCalls.length, 0, 'radar clicks must not query a nonexistent Cartesian grid');
	state.renderer.dispose();
});

test('area tooltip anchors use stacked display heights while retaining original values for previews', () => {
	for (const axisType of ['category', 'value', 'time']) {
		const state = harness();
		const context = { chartType: 'chart-area', xName: 'Period', yLabel: 'Amount', groupNames: ['A', 'B'] };
		const x = axisType === 'category' ? 'Middle' : 1000;
		const raw = { x, y: 3, files: ['source.md'] };
		const point = { value: axisType === 'category' ? 3 : [x, 3], _raw: raw, _stackY: 11 };
		state.renderer.setOption({ xAxis: { type: axisType }, series: [{ type: 'line', stack: 'total', data: [point] }] }, context);
		const anchor = state.tooltips[0].calls[0].anchor;
		assert.deepEqual(Array.from(anchor({ seriesIndex: 1, dataIndex: 2, data: point })), [axisType === 'category' ? 2 : x, 11]);
		assert.equal(raw.y, 3);
		assert.deepEqual(point.value, axisType === 'category' ? 3 : [x, 3]);
		assert.deepEqual(state.charts[0].toPixelCalls, [{ finder: { seriesIndex: 1 }, value: [axisType === 'category' ? 2 : x, 11] }]);
		state.renderer.dispose();
	}
});

test('100% bar anchors use normalized stack edges while column clicks retain every original contribution', () => {
	const state = harness();
	const a = { x: 'Mon', y: 2, groupIndex: 0, files: ['a.md'], fileValues: [2] };
	const b = { x: 'Mon', y: 6, groupIndex: 1, files: ['b.md'], fileValues: [6] };
	const first = { value: 25, _raw: a, _stackY: 25 }, second = { value: 75, _raw: b, _stackY: 100 };
	const context = { chartType: 'chart-bar', barLayout: 'percent', groupNames: ['A', 'B'] };
	state.renderer.setOption({ xAxis: { type: 'category', data: ['Mon'] }, series: [
		{ type: 'bar', stack: 'total', data: [first] }, { type: 'bar', stack: 'total', data: [second] },
	] }, context);
	const anchor = state.tooltips[0].calls[0].anchor;
	assert.deepEqual(Array.from(anchor({ seriesIndex: 1, dataIndex: 0, data: second })), [0, 100]);
	state.charts[0].ordinal = 0;
	state.charts[0].zr.handlers.get('click')({ offsetX: 200, offsetY: 80 });
	assert.deepEqual(Array.from(state.tooltips[0].opened[0].raw), [a, b]);
	state.renderer.dispose();
});

test('numeric area clicks select the nearest aligned X across all groups without duplicate activation', () => {
	const state = harness();
	const context = { chartType: 'chart-area', xName: 'Period', yLabel: 'Amount', groupNames: ['A', 'B'] };
	const first = { x: 10, y: 2, files: ['first.md'] };
	const middleA = { x: 50, y: 3, files: ['middle-a.md'] };
	const middleB = { x: 50, y: 0, files: ['middle-b.md'] };
	const last = { x: 90, y: 4, files: ['last.md'] };
	const datum = raw => ({ value: [raw.x, raw.y], _raw: raw });
	state.renderer.setOption({ xAxis: { type: 'value' }, series: [
		{ type: 'line', data: [datum(first), datum(middleA), datum(last)] },
		{ type: 'line', data: [{ value: [10, 0], _raw: null }, datum(middleB), { value: [90, 0], _raw: null }] },
	] }, context);
	const chart = state.charts[0];
	chart.ordinal = 43;
	chart.handlers.get('click')({ data: datum(middleA) });
	chart.zr.handlers.get('click')({ offsetX: 150, offsetY: 100 });
	assert.equal(state.tooltips[0].opened.length, 1);
	assert.deepEqual(Array.from(state.tooltips[0].opened[0].raw), [middleA, middleB]);
	assert.deepEqual(chart.fromPixelCalls, [{ finder: { xAxisIndex: 0 }, value: 150 }]);
	chart.ordinal = 84;
	chart.zr.handlers.get('click')({ offsetX: 250, offsetY: 100 });
	assert.deepEqual(Array.from(state.tooltips[0].opened[1].raw), [last]);
	chart.contains = false;
	chart.zr.handlers.get('click')({ offsetX: 250, offsetY: 100 });
	assert.equal(state.tooltips[0].opened.length, 2);
	state.renderer.dispose();
});

function pointFixture(chartType, xAxis, series) {
	const state = harness();
	const context = { chartType, xName: 'X', yLabel: 'Count', groupNames: ['A', 'B'] };
	const option = { xAxis, yAxis: { type: 'value' }, series, tooltip: {
		trigger: chartType === 'chart-line' ? 'axis' : 'item',
		axisPointer: { axis: 'x', lineStyle: { color: '#ddd' } },
	} };
	state.renderer.setOption(option, context);
	return { ...state, chart: state.charts[0], tooltip: state.tooltips[0], context, option };
}

const rawPoint = (x, y, name = String(x)) => ({ x, y, files: [`${name}.md`] });
const pairedPoint = raw => ({ value: [raw.x, raw.y], _raw: raw });

test('singleton line categories use the full column, preserve empty bands, and do not merge groups', () => {
	const a = rawPoint('A', 0);
	const b1 = rawPoint('B', 2, 'b1');
	const b2 = rawPoint('B', 4, 'b2');
	const d = rawPoint('D', 5);
	const scalar = raw => ({ value: raw.y, _raw: raw });
	const gap = { value: 0, _raw: null };
	const state = pointFixture('chart-line', { type: 'category', data: ['A', 'B', 'C', 'D'] }, [
		{ type: 'line', data: [scalar(a), scalar(b1), gap, gap] },
		{ type: 'line', data: [gap, scalar(b2), gap, scalar(d)] },
	]);
	for (const ordinal of [0, 1, 2, 3]) {
		state.chart.ordinal = ordinal;
		state.chart.zr.handlers.get('click')({ offsetX: 100, offsetY: 20, target: null });
	}
	assert.deepEqual(state.tooltip.opened.map(item => Array.from(item.raw)), [[a], [d]],
		'zero is a real point, an empty category stays empty, and two real groups are ambiguous');
	state.chart.handlers.get('click')({ data: scalar(b2) });
	assert.equal(state.tooltip.opened.at(-1).raw, b2, 'ambiguous columns retain precise point selection');
	state.chart.ordinal = 1;
	state.chart.zr.handlers.get('mousemove')({ offsetX: 100, offsetY: 20, target: { cursor: 'pointer' } });
	assert.equal(state.chart.zr.cursorStyles.at(-1), 'pointer', 'retain a real point cursor in an ambiguous column');
	state.renderer.dispose();
});

test('sparse scatter columns use explicit category values and do not expand duplicate X points', () => {
	const a1 = rawPoint('A', 1, 'a1');
	const a2 = rawPoint('A', 2, 'a2');
	const c = rawPoint('C', 0);
	const state = pointFixture('chart-scatter', { type: 'category', data: ['A', 'B', 'C'] }, [
		{ type: 'scatter', data: [pairedPoint(a1), pairedPoint(a2)] },
		{ type: 'scatter', data: [pairedPoint(c)] },
	]);
	for (const ordinal of [0, 1, 2]) {
		state.chart.ordinal = ordinal;
		state.chart.zr.handlers.get('click')({ offsetX: 100, offsetY: 20 });
	}
	assert.deepEqual(state.tooltip.opened.map(item => Array.from(item.raw)), [[c]],
		'C is the only singleton despite being the first datum in its series');
	state.chart.zr.handlers.get('mousemove')({ offsetX: 100, offsetY: 20 });
	assert.deepEqual(state.chart.actionPayloads.at(-1), { type: 'showTip', seriesIndex: 1, dataIndex: 0 });
	state.chart.ordinal = 0;
	state.chart.zr.handlers.get('mousemove')({ offsetX: 100, offsetY: 20 });
	assert.equal(state.chart.zr.cursorStyles.at(-1), 'default');
	assert.equal(state.chart.actions.at(-1), 'hideTip');
	state.renderer.dispose();
});

test('continuous line and scatter columns follow projected X midpoints with sparse series and inverse axes', () => {
	for (const type of ['chart-line', 'chart-scatter']) {
		for (const axisType of ['value', 'time', 'log']) {
			for (const inverse of [false, true]) {
				const a = rawPoint(10, 1);
				const b = rawPoint(100, 0);
				const c = rawPoint(1000, 3);
				const state = pointFixture(type, { type: axisType, inverse }, [
					{ data: [pairedPoint(a), pairedPoint(c)] },
					{ data: [pairedPoint(b)] },
				]);
				state.chart.toPixel = (_finder, x) => (inverse ? 600 : 0) + (inverse ? -1 : 1) * ({ 10: 100, 100: 300, 1000: 500 }[x]);
				for (const offsetX of [201, 399]) state.chart.zr.handlers.get('click')({ offsetX, offsetY: 20 });
				assert.deepEqual(state.tooltip.opened.map(item => Array.from(item.raw)), [[b], [b]], `${type}/${axisType}/${inverse}`);
				state.chart.zr.handlers.get('mousemove')({ offsetX: 320, offsetY: 20 });
				assert.deepEqual(state.chart.actionPayloads.at(-1), { type: 'showTip', seriesIndex: 1, dataIndex: 0 });
				state.chart.zr.handlers.get('click')({ offsetX: inverse ? 400 : 200, offsetY: 20 });
				assert.equal(state.tooltip.opened.at(-1).raw[0], a, 'exact midpoint selects the lower data X');
				assert.equal(state.chart.fromPixelCalls.length, 0, 'continuous hit areas use rendered spacing rather than data distances');
				state.renderer.dispose();
			}
		}
	}
});

test('numeric duplicate X and explicit empty positions prevent accidental full-column activation', () => {
	for (const type of ['chart-line', 'chart-scatter']) {
		const a = rawPoint(10, 1, 'a');
		const b = rawPoint(10, 2, 'b');
		const invalid = rawPoint(30, NaN);
		const state = pointFixture(type, { type: 'value' }, [
			{ data: [pairedPoint(a), { value: [20, null], _raw: null }, pairedPoint(invalid)] },
			{ data: [pairedPoint(b)] },
		]);
		for (const offsetX of [10, 20, 30]) state.chart.zr.handlers.get('click')({ offsetX, offsetY: 20 });
		assert.equal(state.tooltip.opened.length, 0);
		state.chart.handlers.get('click')({ data: pairedPoint(b) });
		assert.equal(state.tooltip.opened[0].raw, b);
		state.renderer.dispose();
	}
});

test('single-column and exact-point events open one modal in either callback order', () => {
	for (const type of ['chart-line', 'chart-scatter']) {
		for (const order of ['zr-first', 'chart-first']) {
			const raw = rawPoint(10, 2);
			const point = pairedPoint(raw);
			const state = pointFixture(type, { type: 'value' }, [{ data: [point] }]);
			const event = { offsetX: 10, offsetY: 20, target: {} };
			const zrClick = () => state.chart.zr.handlers.get('click')(event);
			const pointClick = () => state.chart.handlers.get('click')({ data: point, event });
			if (order === 'zr-first') { zrClick(); pointClick(); }
			else { pointClick(); zrClick(); }
			assert.equal(state.tooltip.opened.length, 1, `${type}/${order}`);
			assert.equal(state.openedFiles.length, 0);
			assert.equal(state.chart.actions.at(-1), 'hideTip', 'activation clears the preview');
			assert.equal(state.chart.actionPayloads.at(-2).currTrigger, 'leave', 'activation also clears the vertical guide');
			state.renderer.dispose();
		}
	}
});

test('singleton hover refreshes a fixed preview and dashed X guide on every move after native handlers', () => {
	for (const type of ['chart-line', 'chart-scatter']) {
		const point = pairedPoint(rawPoint(10, 2));
		const state = pointFixture(type, { type: 'value' }, [{ data: [point] }]);
		assert.deepEqual(state.chart.zr.registrations.slice(-3), ['setOption', 'mousemove', 'click']);
		const pointer = state.chart.current.xAxis[0].axisPointer;
		assert.equal(pointer.show, true);
		assert.equal(pointer.type, 'line');
		assert.equal(pointer.lineStyle.type, 'dashed');
		assert.equal(pointer.lineStyle.color, '#ddd');
		assert.equal(pointer.lineStyle.width, 1);
		assert.equal(pointer.label.show, false);
		assert.equal(pointer.triggerTooltip, type === 'chart-line');
		assert.equal(state.option.xAxis.axisPointer, undefined, 'rendering does not mutate the source option');
		assert.equal(state.chart.current.yAxis.axisPointer, undefined, 'no horizontal guide is introduced');
		const before = state.chart.actionPayloads.length;
		for (const [offsetX, offsetY] of [[4, 20], [15, 300], [10, 250]]) {
			state.chart.zr.handlers.get('mousemove')({ offsetX, offsetY });
		}
		assert.deepEqual(state.chart.actionPayloads.slice(before), Array.from({ length: 3 }, () => [
			{ type: 'updateAxisPointer', currTrigger: 'mousemove', seriesIndex: 0, dataIndex: 0 },
			{ type: 'showTip', seriesIndex: 0, dataIndex: 0 },
		]).flat(), 'blank-space moves must re-show the tooltip after the native handler hides it');
		assert.deepEqual(state.chart.zr.cursorStyles, ['pointer', 'pointer', 'pointer']);
		state.chart.zr.handlers.get('globalout')();
		assert.deepEqual(state.chart.actionPayloads.slice(-2), [
			{ type: 'updateAxisPointer', currTrigger: 'leave' }, { type: 'hideTip' },
		]);
		state.chart.contains = false;
		state.chart.zr.handlers.get('mousemove')({ offsetX: 10, offsetY: 500 });
		state.chart.zr.handlers.get('click')({ offsetX: 10, offsetY: 500 });
		assert.equal(state.chart.actions.at(-1), 'hideTip');
		assert.equal(state.tooltip.opened.length, 0);
		state.renderer.dispose();
	}
});

test('cached projected columns refresh on resizing, option updates, and window migration', () => {
	const a = rawPoint(10, 1);
	const b = rawPoint(20, 2);
	const state = pointFixture('chart-line', { type: 'value' }, [{ data: [pairedPoint(a), pairedPoint(b)] }]);
	const click = () => state.chart.zr.handlers.get('click')({ offsetX: 15, offsetY: 20 });
	click();
	click();
	assert.equal(state.chart.toPixelCalls.length, 2, 'mousemove/click reuse the projected X index');
	state.flushTimers();
	click();
	assert.equal(state.chart.toPixelCalls.length, 4, 'first-layout resize also invalidates projections');
	state.chart.toPixel = (_finder, x) => x - 5;
	state.container.clientWidth = 800;
	state.observers[0].callback();
	state.flushTimers();
	click();
	assert.equal(state.tooltip.opened.at(-1).raw[0], b);
	assert.equal(state.chart.toPixelCalls.length, 6);
	state.chart.toPixel = (_finder, x) => x + 5;
	state.container.clientWidth = 900;
	state.window.listeners.get('resize')();
	state.flushTimers();
	click();
	assert.equal(state.tooltip.opened.at(-1).raw[0], a, 'zoom must update the clickable columns as well as the canvas');
	assert.equal(state.chart.toPixelCalls.length, 8);
	const c = rawPoint(15, 3);
	state.renderer.setOption({ ...state.option, series: [{ data: [pairedPoint(c)] }] }, state.context);
	click();
	assert.equal(state.tooltip.opened.at(-1).raw[0], c);
	state.migrate(createWindow());
	state.charts[1].zr.handlers.get('click')({ offsetX: 15, offsetY: 20 });
	assert.equal(state.tooltips[1].opened[0].raw[0], c);
	assert.equal(state.charts[1].toPixelCalls.length, 1);
	state.renderer.dispose();
});

test('portrait touch columns update a persistent preview without opening a drawer', () => {
	const state = barFixture();
	state.tooltip.touchPreview = true;
	state.chart.ordinal = 1;
	const event = { offsetX: 150, offsetY: 20, target: null };
	state.chart.zr.handlers.get('mousemove')(event);
	assert.equal(state.tooltip.previews.length, 1);
	assert.deepEqual(Array.from(state.tooltip.previews[0].params, p => p.data._raw), [state.middleA, state.middleB]);
	assert.equal(state.tooltip.previews[0].params[0].color, '#123456');
	state.chart.zr.handlers.get('click')(event);
	assert.equal(state.tooltip.opened.length, 0);
	const count = state.tooltip.previews.length;
	const resets = state.tooltip.resets;
	state.chart.zr.handlers.get('globalout')();
	state.window.listeners.get('scroll')();
	state.container.clientWidth = 320;
	state.window.listeners.get('resize')();
	state.flushTimers();
	assert.equal(state.tooltip.previews.length, count, 'release, scrolling and resize retain the selected summary');
	assert.equal(state.tooltip.resets, resets);
	state.tooltip.touchPreview = false;
	state.chart.zr.handlers.get('click')({ ...event });
	assert.equal(state.tooltip.opened.length, 1, 'landscape/tablet clicks retain direct file inspection');
	state.renderer.dispose();
});

test('portrait grouped line previews all values at the touched X coordinate', () => {
	const a = rawPoint('Monday', 2);
	const b = rawPoint('Monday', 5);
	const state = pointFixture('chart-line', { type: 'category', data: ['Monday'] }, [
		{ data: [{ value: 2, _raw: a }] }, { data: [{ value: 5, _raw: b }] },
	]);
	state.tooltip.touchPreview = true;
	state.chart.zr.handlers.get('mousemove')({ offsetX: 100, offsetY: 50 });
	assert.deepEqual(Array.from(state.tooltip.previews.at(-1).params, p => p.data._raw), [a, b]);
	assert.equal(state.tooltip.opened.length, 0);
	state.renderer.dispose();
});

test('portrait radial marks preview their real datum and wait for View data', () => {
	const state = harness();
	const context = { chartType: 'chart-pie' };
	const raw = rawPoint('Design', 4);
	state.renderer.setOption({ series: [{ type: 'pie', data: [{ value: 4, _raw: raw }] }] }, context);
	state.tooltips[0].touchPreview = true;
	const params = { data: { _raw: raw }, percent: 25, color: '#678', event: { offsetX: 10, offsetY: 20 } };
	state.charts[0].handlers.get('mouseover')(params);
	state.charts[0].handlers.get('click')(params);
	assert.equal(state.tooltips[0].previews.at(-1).params, params);
	assert.equal(state.tooltips[0].opened.length, 0);
	state.renderer.dispose();
});

test('native long touch and horizontal drag inspect data while vertical drag remains a scroll', () => {
	const state = harness(true);
	const raw = rawPoint('Monday', 2);
	const context = { chartType: 'chart-line' };
	state.renderer.setOption({ xAxis: { type: 'category', data: ['Monday'] }, series: [{ data: [{ value: 2, _raw: raw }] }] }, context);
	const tooltip = state.tooltips[0];
	tooltip.touchPreview = true;
	const touch = (x, y) => ({ touches: [{ identifier: 1, clientX: x, clientY: y }] });
	state.container.listeners.get('touchstart')(touch(50, 50));
	state.container.listeners.get('touchmove')(touch(90, 51));
	assert.equal(tooltip.previews.length, 2);
	state.container.listeners.get('touchmove')(touch(90, 140));
	state.container.listeners.get('touchmove')(touch(100, 150));
	assert.equal(tooltip.previews.length, 2, 'vertical scrolling must not scrub across columns');
	state.container.listeners.get('touchend')();
	assert.equal(tooltip.opened.length, 0, 'release after a long touch never opens the sheet');
	state.container.listeners.get('touchstart')({ touches: [{}, {}] });
	assert.equal(tooltip.previews.length, 2, 'multi-touch gestures are ignored');
	state.renderer.dispose();
	assert.equal(state.container.listeners.size, 0);
});

test('folding refreshes tooltip and emphasis options without resetting the shared selection or duplicating handlers', () => {
	const state = harness(true);
	const chart = state.charts[0];
	const tooltip = state.tooltips[0];
	const raw = rawPoint('Monday', 2);
	const series = [{ type: 'bar', emphasis: { focus: 'series', label: { fontSize: 14 } }, data: [{ value: 2, _raw: raw }] }];
	const option = { tooltip: { trigger: 'axis', triggerOn: 'mousemove', axisPointer: { type: 'shadow' } },
		xAxis: { type: 'category', data: ['Monday'] }, series };
	const context = { chartType: 'chart-bar' };
	state.renderer.setOption(option, context);
	state.flushTimers();
	const resetCount = tooltip.resets;
	const originalSize = [state.container.clientWidth, state.container.clientHeight];
	for (const mode of [true, false, true]) {
		const calls = chart.calls.length;
		tooltip.touchPreview = mode;
		state.window.listeners.get('resize')();
		state.observers[0].callback();
		state.flushTimers();
		assert.equal(chart.calls.length, calls + 1, 'refresh a changed mode even when canvas dimensions stay unchanged');
		assert.deepEqual([state.container.clientWidth, state.container.clientHeight], originalSize);
		assert.equal(chart.current.tooltip.show, !mode);
		assert.equal(chart.current.tooltip.triggerOn, mode ? 'none' : 'mousemove');
		assert.equal(chart.current.series[0].emphasis.focus, mode ? 'none' : 'series');
		assert.equal(chart.current.series[0].emphasis.disabled, mode ? true : undefined);
		assert.equal(chart.current.series[0].emphasis.label.fontSize, 14);
		assert.equal(chart.current.xAxis.axisPointer, undefined, 'clear the portrait-only column guide when reapplying options');
		assert.equal(chart.current.tooltip.axisPointer.type, 'shadow');
		assert.equal(tooltip.resets, resetCount);
		assert.equal(chart.zr.handlers.size, 3);
		assert.deepEqual(chart.zr.registrations.slice(-3), ['setOption', 'mousemove', 'click']);
		if (tooltip.selection) assert.equal(tooltip.selection.params[0].data._raw, raw);
		if (mode) {
			chart.zr.handlers.get('mousemove')({ offsetX: 100, offsetY: 50 });
			assert.equal(chart.current.xAxis.axisPointer.type, 'line');
			assert.equal(tooltip.selection.params[0].data._raw, raw);
		}
		const stableCalls = chart.calls.length;
		state.observers[0].callback();
		state.flushTimers();
		assert.equal(chart.calls.length, stableCalls, 'unchanged notifications do not reapply options');
	}
	assert.equal(series[0].emphasis.focus, 'series', 'do not mutate the stored floating-mode options');
	assert.equal(series[0].emphasis.disabled, undefined);
	state.renderer.setOption(option, context);
	assert.equal(tooltip.resets, resetCount + 1, 'real data/config updates still reset stale selections');
	assert.equal(tooltip.selection, null);
	state.renderer.dispose();
});
