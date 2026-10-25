import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import env from 'zrender/lib/core/env.js';

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, SVGRenderer]);
// Keep the real browser event/tooltip pipeline, using SVG and rich text so no
// DOM implementation is needed. Only Obsidian's host and HTML modal are stubs.
const wasNode = env.node;
env.node = false;
after(() => { env.node = wasNode; });
const bundle = await build({
	entryPoints: [fileURLToPath(new URL('../src/utils/renderer.ts', import.meta.url))],
	bundle: true, write: false, format: 'cjs', platform: 'node',
	plugins: [{
		name: 'column-interaction-host',
		setup(builder) {
			builder.onResolve({ filter: /^(\.\.\/echarts|\.\.\/ui\/chartTooltip)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === '../echarts'
					? 'export const echarts = { init: element => runtime.init(element) };'
					: `export class ChartTooltip {
						options(base) { return { ...base, renderMode: 'richText', hideDelay: 0, formatter: () => 'Column preview' }; }
						openFiles(raw) { runtime.opened.push(raw); }
						dispose() {}
					}`,
			}));
		},
	}],
});

function harness(type, axisType, duplicateX = false) {
	let chart;
	const opened = [];
	const container = {
		getAttribute() {}, setAttribute() {},
		ownerDocument: { defaultView: { setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} } },
		onWindowMigrated: () => () => {},
	};
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, {
		module, exports: module.exports,
		runtime: {
			opened,
			init: element => (chart = echarts.init(element, null, { renderer: 'svg', ssr: true, width: 600, height: 400 })),
		},
		ResizeObserver: class { observe() {} disconnect() {} },
	});
	const renderer = new module.exports.ChartRenderer(container, { app: {}, openFile: async () => {} });
	const xs = axisType === 'category' ? ['First', 'Last']
		: axisType === 'time' ? [1792972800000, 1793059200000] : [10, 30];
	const data = xs.map((x, index) => ({
		value: axisType === 'category' && type === 'line' ? index + 3 : [x, index + 3],
		_raw: { x, y: index + 3, files: [`${index}.md`], fileValues: [index + 3], groupIndex: 0 },
	}));
	if (duplicateX) data.push({ value: [xs[1], 8], _raw: { x: xs[1], y: 8, files: ['duplicate.md'], fileValues: [8], groupIndex: 0 } });
	renderer.setOption({
		animation: false,
		xAxis: { type: axisType, data: axisType === 'category' ? xs : undefined },
		yAxis: { min: 0, max: 10 },
		tooltip: { trigger: type === 'line' ? 'axis' : 'item', axisPointer: {
			type: 'line', axis: 'x', label: { show: false }, lineStyle: { color: '#18384f', type: 'dashed', width: 1 },
		} },
		series: [{ type, data }],
	}, { chartType: `chart-${type}`, xName: 'X', yLabel: 'Y', groupNames: [], showPercentages: false });
	const guide = () => chart.getZr().storage.getDisplayList(true).filter(element =>
		element.type.toLowerCase() === 'line' && element.style.stroke === '#18384f');
	const previewVisible = () => chart.getZr().storage.getDisplayList(true).some(element =>
		element.type === 'tspan' && element.style.text === 'Column preview');
	const xPixel = index => chart.convertToPixel({ xAxisIndex: 0 }, xs[index]);
	return { renderer, chart, opened, guide, previewVisible, xPixel };
}

for (const type of ['line', 'scatter']) for (const axisType of ['category', 'value', 'time']) {
	test(`real ${type} ${axisType} column hover keeps its dashed guide and tooltip through repeated moves`, () => {
		const state = harness(type, axisType);
		try {
			for (const index of [0, 0, 1]) {
				const x = state.xPixel(index);
				state.chart.getZr().trigger('mousemove', { offsetX: x, offsetY: 90, target: null });
				assert.equal(state.previewVisible(), true, 'the native blank-space hide must not override the column preview');
				const [guide] = state.guide();
				assert.equal(state.guide().length, 1);
				assert.equal(guide.style.lineDash, 'dashed');
				assert.equal(guide.style.lineWidth, 1);
				assert.ok(Math.abs(guide.shape.x1 - x) < 0.01);
				assert.equal(guide.shape.x1, guide.shape.x2);
				assert.ok(Math.abs(guide.shape.y2 - guide.shape.y1) > 200, 'the guide spans the plot height');
			}
			state.chart.getZr().trigger('globalout', {});
			assert.equal(state.previewVisible(), false);
			assert.equal(state.guide().length, 0, 'leaving the chart hides the guide as well as the preview');
		} finally { state.renderer.dispose(); }
	});
}

test('real ECharts point and ZRender click callbacks open one modal, while ambiguous columns require a point', () => {
	const state = harness('scatter', 'category', true);
	try {
		const points = state.chart.getModel().getSeriesByIndex(0).getData();
		const emit = (index, target) => state.chart.getZr().trigger('click', { offsetX: state.xPixel(index), offsetY: 90, target });
		emit(0, points.getItemGraphicEl(0));
		assert.equal(state.opened.length, 1, 'the same event reaches both handlers but opens only one modal');
		emit(0, null);
		assert.equal(state.opened.length, 2, 'empty space in a singleton column opens its data');
		emit(1, null);
		assert.equal(state.opened.length, 2, 'blank space cannot choose between two points at the same X');
		emit(1, points.getItemGraphicEl(2));
		assert.equal(state.opened.length, 3, 'a specific point remains clickable in an ambiguous column');
		assert.deepEqual(state.opened[2].files, ['duplicate.md']);
		assert.equal(state.guide().length, 0, 'opening a modal clears the guide');
	} finally { state.renderer.dispose(); }
});
