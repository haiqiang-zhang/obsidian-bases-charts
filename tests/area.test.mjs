import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

const bundled = await build({
	stdin: {
		contents: `
			export { AreaChartView, buildAreaOption, getStackedAreaDomain } from './src/dataCharts/charts/areaChart.ts';
			export { PropertySeparatedData } from './src/dataCharts/data.ts';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'area-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian'
				? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
				: `export class DataChartView {
					processData() { return this.prepared; }
					getYDomainOverrides() { return this.overrides; }
				}`,
			}));
		},
	}],
});
const { AreaChartView, buildAreaOption, getStackedAreaDomain, PropertySeparatedData } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);
const colors = { palette: ['#668aaa', '#8da78b', '#bca162'], background: '#fff', text: '#222', mutedText: '#666', grid: '#ddd', accent: '#668aaa' };
const point = (x, y, groupIndex = 0, chartIndex = 0) => ({
	x, y, groupIndex, chartIndex, isNumeric: true,
	files: [`group-${groupIndex}/${String(x)}-${chartIndex}.md`], fileValues: [y],
});
function data(points, order, type = 'category', domain = {}) {
	return new PropertySeparatedData(points, ['One', 'Two', 'Three'], order, type,
		{ min: null, max: null, synced: false, ...domain },
		['note.amount', 'note.hours'], new Map([['note.amount', 'Amount'], ['note.hours', 'Hours']]));
}
function option(wrapper, chartIndex = 0) {
	return buildAreaOption(wrapper, chartIndex, 'Category', 'Amount (Sum)', true, colors);
}

function assertSvg(chart) {
	const svg = chart.renderToSVGString();
	assert.match(svg, /^<svg\b/);
	assert.match(svg, /<path\b/);
	assert.doesNotMatch(svg, /NaN|Infinity/);
}
function stackedValues(chart) {
	return chart.getModel().getSeries().map(series => {
		const data = series.getData();
		const dimension = data.getCalculationInfo('stackResultDimension');
		return Array.from({ length: data.count() }, (_, index) => data.get(dimension, index));
	});
}

test('area keeps categorical order and group colors, fills absent samples without inventing source files', () => {
	const points = [point('A', 4, 2), point('B', 5), point('C', 2, 2), point('C', 3)];
	const wrapper = data(points, ['C', 'A', 'B']);
	const built = option(wrapper);
	assert.deepEqual(built.xAxis.data, ['C', 'A', 'B']);
	assert.equal(built.xAxis.boundaryGap, false);
	assert.deepEqual(built.series.map(series => series.name), ['One', 'Three']);
	assert.deepEqual(built.series.map(series => series.itemStyle.color), [colors.palette[0], colors.palette[2]]);
	assert.deepEqual(built.series.map(series => series.data.map(d => d.value)), [[3, 0, 5], [2, 4, 0]]);
	assert.deepEqual(built.series.map(series => series.data.map(d => d._stackY)), [[3, 0, 5], [5, 4, 5]]);
	assert.equal(built.series[0].data[1]._raw, null);
	assert.equal(built.series[1].data[0]._raw, points[2]);
	assert.deepEqual(built.series.flatMap(series => series.data.flatMap(d => d._raw?.files ?? [])).sort(), points.flatMap(p => p.files).sort());
	assert.deepEqual(points.map(p => p.x), ['A', 'B', 'C', 'C'], 'do not reorder the shared source array');
});

for (const type of ['value', 'time']) {
	test(`real ECharts stacks sparse ${type} samples at matching X positions, including signed values`, () => {
		const xs = type === 'time'
			? [new Date('2026-10-25T00:00:00Z'), new Date('2026-10-25T01:00:00Z'), new Date('2026-10-25T02:00:00Z')]
			: [12345, 12346, 12347];
		const points = [point(xs[2], 4), point(xs[0], 3), point(xs[1], -2), point(xs[0], 7, 1), point(xs[1], -5, 1)];
		const wrapper = data(points, [xs[2], xs[0], xs[1]], type);
		const built = option(wrapper);
		const coordinates = xs.map(x => x instanceof Date ? x.getTime() : x);
		assert.deepEqual(built.series.map(series => series.data.map(d => d.value[0])), [coordinates, coordinates]);
		assert.deepEqual(built.series.map(series => series.data.map(d => d.value[1])), [[3, -2, 4], [7, -5, 0]]);
		assert.deepEqual(built.series.map(series => series.data.map(d => d._stackY)), [[3, -2, 4], [10, -7, 4]]);
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 320 });
		try {
			chart.setOption({ ...built, animation: false }, { notMerge: true });
			for (const [width, height] of [[320, 320], [1000, 420], [320, 320]]) {
				chart.resize({ width, height });
				assertSvg(chart);
				assert.deepEqual(stackedValues(chart), [[3, -2, 4], [10, -7, 4]], 'the renderer must stack Y, not X, with aligned positions');
				const extent = chart.getModel().getComponent('yAxis').axis.scale.getExtent();
				assert.ok(extent[0] <= -7 && extent[1] >= 10, 'automatic axis must contain cumulative totals');
			}
		} finally { chart.dispose(); }
	});
}

test('stacked Y overrides use cumulative positive/negative totals and synchronize all selected measures', () => {
	const points = [point('A', 5), point('A', 7, 1), point('B', -2), point('B', -4, 1), point('A', 20, 0, 1), point('A', 30, 1, 1)];
	assert.deepEqual(getStackedAreaDomain(data(points, ['A', 'B']), 0), [-6, 12]);
	const synced = data(points, ['A', 'B'], 'category', { synced: true });
	assert.deepEqual(getStackedAreaDomain(synced, 0), [-6, 50]);
	assert.deepEqual(getStackedAreaDomain(synced, 1), [-6, 50]);
	assert.equal(option(synced).yAxis.max, 50);
	const partial = data(points, ['A', 'B'], 'category', { min: -10 });
	assert.equal(option(partial).yAxis.min, -10);
	assert.equal(option(partial).yAxis.max, 12, 'an explicit minimum must not clip the cumulative maximum');
	assert.deepEqual(getStackedAreaDomain(data(points, ['A', 'B'], 'category', { min: -15, max: 100, synced: true }), 0), [-15, 100]);
});

test('area view discards raw-value sync bounds while retaining explicit scale settings', () => {
	const view = new AreaChartView();
	const points = [point('A', 5), point('A', 7, 1)];
	view.prepared = data(points, ['A'], 'category', { min: 5, max: 7, synced: true });
	view.overrides = { min: null, max: null, synced: true };
	assert.deepEqual(getStackedAreaDomain(view.processData(), 0), [0, 12]);
	view.overrides = { min: -1, max: 50, synced: true };
	assert.deepEqual(getStackedAreaDomain(view.processData(), 0), [-1, 50]);
});

test('real ECharts renders a zero-valued stack and long category labels without invalid or clipped text', () => {
	const categories = Array.from({ length: 16 }, (_, index) => `Long collection / course / research notes ${index}`);
	const wrapper = data(categories.flatMap(x => [point(x, 0), point(x, 0, 1)]), categories, 'category', { synced: true });
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 320 });
	try {
		chart.setOption({ ...option(wrapper), animation: false }, { notMerge: true });
		for (const width of [320, 1000, 320]) {
			chart.resize({ width, height: 320 });
			assertSvg(chart);
			for (const text of chart.getZr().storage.getDisplayList(true).filter(el => el.type === 'tspan' && !el.ignore && !el.invisible)) {
				const rect = text.getBoundingRect().clone();
				const transform = text.getComputedTransform();
				if (transform) rect.applyTransform(transform);
				assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 321, `text must fit: ${text.style.text}`);
			}
		}
	} finally { chart.dispose(); }
});

test('zero-valued observations retain anchors on the ECharts edge after mixed positive and negative stacks', () => {
	const wrapper = data([point('A', 5), point('A', -2, 1), point('A', 0, 2)], ['A']);
	const built = option(wrapper);
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 480, height: 320 });
	try {
		chart.setOption({ ...built, animation: false }, { notMerge: true });
		assertSvg(chart);
		assert.deepEqual(stackedValues(chart), [[5], [-2], [-2]]);
		assert.deepEqual(built.series.map(series => series.data.map(d => d._stackY)), stackedValues(chart));
		assert.equal(built.series[2].data[0]._raw.y, 0, 'the tooltip still shows the source contribution');
	} finally { chart.dispose(); }
});
