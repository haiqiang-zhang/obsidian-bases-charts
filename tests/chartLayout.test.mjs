import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	stdin: {
		contents: `
			export { ChartLayout } from './src/dataCharts/layout.ts';
			export { DataChartView } from './src/dataCharts/dataChartView.ts';
			export { RadarChartView } from './src/dataCharts/charts/radarChart.ts';
			export { PropertySeparatedData } from './src/dataCharts/data.ts';
			export { Events } from 'obsidian';
			export { CHART_PALETTES, DEFAULT_CHART_PALETTE, getPaletteColors } from './src/ui/chartPalettes.ts';
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
			builder.onResolve({ filter: /^(obsidian|echarts|\.\.\/ui\/chartToolbar|\.\.\/ui\/chartFormulaEditor|\.\.\/ui\/groupColorsModal|\.\.\/utils\/renderer)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian' ? `
					export class BasesView { constructor(controller) { this.app = controller.app; } addChild(child) { return child; } removeChild() {} }
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
					export class NullValue {}
					export class Menu {}
					export class DateValue {}
					export class ListValue {}
					export class NumberValue {}
					export class StringValue {}
					export function setIcon(element, icon) { element.icon = icon; }
				` : args.path === 'echarts' ? 'export const format = { truncateText: text => text };'
					: args.path === '../ui/chartToolbar' ? 'export class ChartToolbar {}'
						: args.path === '../ui/chartFormulaEditor' ? 'export class ChartFormulaEditor {}'
							: args.path === '../ui/groupColorsModal' ? 'export class GroupColorCustomModal {}'
								: 'export class ChartRenderer { constructor(...args) { return runtime.createRenderer(...args); } }',
			}));
		},
	}],
});

class Element {
	isConnected = true;
	children = [];
	classes = new Set();
	parentElement = null;
	listeners = new Map();
	attributes = new Map();
	style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
	win = { getComputedStyle: () => ({ getPropertyValue: () => '' }) };
	doc = { body: { classList: { contains: () => false } } };

	createEl(_tag, options = {}) {
		const child = new Element();
		child.textContent = options.text ?? '';
		child.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		child.parentElement = this;
		for (const [key, value] of Object.entries(options.attr ?? {})) child.setAttribute(key, value);
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	addEventListener(name, callback) { this.listeners.set(name, callback); }
	setAttribute(name, value) { this.attributes.set(name, value); }
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
		createRenderer(_container, view) {
			const renderer = { view, calls: [], messages: [], setOption(...args) { this.calls.push(args); }, showMessage(...args) { this.messages.push(args); }, dispose() {} };
			renderers.push(renderer);
			return renderer;
		},
	};
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, runtime });
	const { ChartLayout, DataChartView, RadarChartView, PropertySeparatedData, Events, CHART_PALETTES, DEFAULT_CHART_PALETTE, getPaletteColors } = module.exports;
	const workspace = new Events();
	class TestView extends DataChartView {
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
		buildOption(data, _chartIndex, _xName, _yLabel, _isGrouped, colors) {
			return { color: colors.palette, series: [{ data: data.getFlat(0).map(entry => entry.y) }] };
		}
	}
	const createView = () => {
		const view = new TestView({ app: { workspace } }, new Element());
		view.onload();
		return view;
	};
	const view = createView();
	return {
		view, workspace, renderers, createView, RadarChartView, PropertySeparatedData, CHART_PALETTES, DEFAULT_CHART_PALETTE, getPaletteColors,
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

test('detached embeds render with their owning document font before attachment', () => {
	const h = harness();
	h.view.config = config;
	h.view.data = data;
	h.view.containerEl.isConnected = false;
	h.view.containerEl.win.getComputedStyle = target => {
		assert.equal(target, h.view.containerEl.doc.body);
		return { fontFamily: 'Obsidian test font', getPropertyValue: () => '' };
	};
	h.view.onDataUpdated(); h.flush();
	assert.equal(h.renderers[0].calls[0][0].textStyle.fontFamily, 'Obsidian test font');
	h.view.onunload();
});

function paletteConfig(value) {
	return { ...config, get: key => key === 'color-palette' ? value : false };
}

test('layout delivers each view palette independently and resolves it in the owning theme', () => {
	const host = harness();
	const second = host.createView();
	const [firstPalette, secondPalette] = host.CHART_PALETTES.filter(palette => palette.id !== host.DEFAULT_CHART_PALETTE);
	assert.ok(firstPalette && secondPalette, 'palette isolation needs two selectable palettes');
	host.view.config = paletteConfig(firstPalette.id);
	second.config = paletteConfig(secondPalette.id);
	host.view.data = data;
	second.data = data;
	second.containerEl.doc.body.classList.contains = name => name === 'theme-dark';

	host.workspace.trigger('css-change');
	host.flush();
	const firstRenderer = host.renderers.find(renderer => renderer.view === host.view);
	const secondRenderer = host.renderers.find(renderer => renderer.view === second);
	assert.deepEqual(firstRenderer.calls[0][0].color, host.getPaletteColors(firstPalette.id, false));
	assert.deepEqual(secondRenderer.calls[0][0].color, host.getPaletteColors(secondPalette.id, true));

	// Editing one view must not alter another view using the same palette module.
	host.view.config = paletteConfig(secondPalette.id);
	host.view.onDataUpdated();
	host.flush();
	assert.equal(secondRenderer.calls.length, 1);
	assert.deepEqual(firstRenderer.calls[1][0].color, host.getPaletteColors(secondPalette.id, false));
	host.workspace.trigger('css-change');
	host.flush();
	assert.deepEqual(secondRenderer.calls[1][0].color, host.getPaletteColors(secondPalette.id, true));
	host.view.onunload();
	second.onunload();
});

test('saved views without a palette or with an unknown palette keep the Auto fallback', () => {
	const host = harness();
	host.view.data = data;
	for (const savedValue of [undefined, 'removed-palette', { id: 'blue' }]) {
		host.view.config = paletteConfig(savedValue);
		host.view.onDataUpdated();
		host.flush();
		assert.deepEqual(host.renderers[0].calls.at(-1)[0].color, host.getPaletteColors(host.DEFAULT_CHART_PALETTE, false));
		assert.equal(host.view.config.get('color-palette'), savedValue, 'fallback must not rewrite saved view settings');
	}
	host.view.onunload();
});

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

function radarLayoutFixture(categories) {
	const host = harness();
	const view = new host.RadarChartView({ app: { workspace: host.workspace } }, new Element());
	const properties = ['note.budget', 'note.spending'];
	const points = categories.map((x, index) => ({
		x, y: index + 1, chartIndex: 1, groupIndex: 0, isNumeric: true,
		files: [`${x}.md`], fileValues: [index + 1],
	}));
	const processed = new host.PropertySeparatedData(points, ['All'], categories, 'category',
		{ min: null, max: null, synced: false }, properties,
		new Map([['note.budget', 'Budget'], ['note.spending', 'Spending']]));
	view.processData = () => processed;
	view.config = { ...config, get: key => key === 'y' ? properties : undefined };
	view.data = { groupedData: [{ entries: points }] };
	view.onload();
	view.onDataUpdated();
	host.flush();
	return { ...host, radar: view, processed };
}

test('radar combines selected values into one plot when only the second value property has data', () => {
	const host = radarLayoutFixture(['Sales', 'Support', 'Marketing']);
	const renderers = host.renderers.filter(renderer => renderer.view === host.radar);
	assert.equal(renderers.length, 1, 'all selected measures share one radar canvas');
	assert.equal(host.processed.getFlat(0).length, 0, 'the fixture must have no first-property values');
	assert.equal(renderers[0].messages.length, 0, 'data in later measures must not be hidden by the first empty measure');
	assert.equal(renderers[0].calls.length, 1);
	const [option, context] = renderers[0].calls[0];
	assert.equal(option.series.length, 1);
	assert.equal(option.series[0].name, 'Spending');
	assert.deepEqual(Array.from(option.series[0].data[0].value), [1, 2, 3]);
	assert.equal(context.chartType, 'chart-radar');
	assert.equal(context.yLabel, 'Values');
	const legend = host.radar.containerEl.children.find(child => child.classes.has('bases-charts-plot-legend'));
	assert.equal(legend.children[0].children[1].textContent, 'Spending');
	assert.equal(legend.children[0].children[0].style.values.get('--color'), option.series[0].itemStyle.color,
		'the legend must retain the same measure color when an earlier measure has no values');
	host.radar.onunload();
	host.view.onunload();
});

test('radar explains the three-category minimum instead of rendering an invalid polygon', () => {
	const host = radarLayoutFixture(['Sales', 'Support']);
	const renderer = host.renderers.find(item => item.view === host.radar);
	assert.equal(renderer.calls.length, 0);
	assert.match(renderer.messages[0][0], /at least three categories/);
	assert.equal(renderer.messages[0][1], undefined, 'numeric data must not offer the unrelated Count repair');
	host.radar.onunload();
	host.view.onunload();
});

test('editable legend opens the correct stable group key and uses the rendered color', () => {
	const host = harness();
	const groups = [
		{ key: '["String","Design"]', name: 'Design', groupIndex: 0, color: '#67539B' },
		{ key: '["String","Research"]', name: 'Research', groupIndex: 1, color: '#338866' },
	];
	const processed = new host.PropertySeparatedData(
		[{ x: 'A', y: 42, groupIndex: 0, chartIndex: 0, isNumeric: true, files: ['A.md'], fileValues: [42] }],
		['Design', 'Research'], ['A'], 'category', { min: null, max: null, synced: false }, ['note.amount'], new Map());
	host.view.config = config;
	host.view.data = data;
	host.view.processData = () => processed;
	host.view.getGroupColorEntries = () => groups;
	host.view.getResolvedGroupColors = () => new Map(groups.map(group => [group.groupIndex, group.color]));
	const opened = [];
	host.view.openGroupColors = key => opened.push(key);
	host.view.onDataUpdated(); host.flush();
	const legend = host.view.containerEl.children.find(child => child.classes.has('bases-charts-plot-legend'));
	assert.equal(legend.children.length, 2, 'color editing keeps the original legend without extra actions');
	groups.forEach((group, index) => {
		const button = legend.children[index];
		assert.equal(button.attributes.get('aria-label'), `Change color for ${group.name}`);
		assert.equal(button.children[0].style.values.get('--color'), group.color);
		button.listeners.get('click')();
	});
	assert.deepEqual(opened, groups.map(group => group.key));
	assert.equal(host.renderers[0].calls[0][1].isGrouped, true);
	host.view.onunload();
});

test('radar legend matches custom measure patterns and opens the group rather than the measure', () => {
	const host = radarLayoutFixture(['Sales', 'Support', 'Marketing']);
	const group = { key: '["String","Team"]', name: 'Team', groupIndex: 0, color: '#557799' };
	host.processed.isGrouped = true;
	host.radar.getGroupColorEntries = () => [group];
	host.radar.getResolvedGroupColors = () => new Map([[0, group.color]]);
	const opened = [];
	host.radar.openGroupColors = key => opened.push(key);
	host.radar.onDataUpdated(); host.flush();
	const legend = host.radar.containerEl.children.find(child => child.classes.has('bases-charts-plot-legend'));
	const button = legend.children[0];
	const swatch = button.children[0];
	const renderer = host.renderers.find(renderer => renderer.view === host.radar);
	const [option, context] = renderer.calls.at(-1);
	assert.equal(context.isGrouped, true, 'a single actual group must retain tooltip context');
	assert.equal(swatch.style.values.get('--color'), option.series[0].itemStyle.color);
	assert.equal(swatch.classes.has('is-patterned'), true);
	assert.equal(swatch.style.values.get('--line-style'), option.series[0].lineStyle.type);
	assert.equal(swatch.attributes.get('data-symbol'), option.series[0].symbol);
	assert.equal(button.attributes.get('aria-label'), 'Change color for Team');
	button.listeners.get('click')();
	assert.deepEqual(opened, [group.key]);
	host.radar.onunload(); host.view.onunload();
});
