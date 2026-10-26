import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

const bundle = await build({
	stdin: {
		contents: `export { BarChartView, buildBarOption } from './src/dataCharts/charts/barChart';
			export { PropertySeparatedData } from './src/dataCharts/data';
			export { normalizeBarLayout } from './src/dataCharts/stacking';`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{ name: 'bar-host-boundaries', setup(builder) {
		builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host' }));
		builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian'
			? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
			: 'export class DataChartView { processData() { return this.prepared; } getYDomainOverrides() { return this.overrides; } }',
		}));
	} }],
});
const { BarChartView, buildBarOption, PropertySeparatedData, normalizeBarLayout } = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const colors = { palette: ['#5785B1', '#6D9875', '#B99A4F'], background: '#fff', text: '#222', mutedText: '#666', grid: '#ddd', accent: '#5785B1' };
const point = (x, y, groupIndex = 0, chartIndex = 0) => ({
	x, y, groupIndex, chartIndex, isNumeric: true,
	files: [`${x}-${groupIndex}-${chartIndex}.md`], fileValues: [y],
});
function data(points, order, domain = {}, type = 'category') {
	return new PropertySeparatedData(points, ['Database', 'Networks', 'OS'], order, type,
		{ min: null, max: null, synced: false, ...domain }, ['note.hours', 'note.amount'],
		new Map([['note.hours', 'Hours'], ['note.amount', 'Amount']]));
}
function option(wrapper, layout, chartIndex = 0) {
	return buildBarOption(wrapper, chartIndex, 'Day', 'Hours (Sum)', true, colors, true, false, wrapper.hasDomainOverride(), layout);
}
function sample() {
	return data([point('Mon', 2), point('Mon', 3, 1), point('Mon', 1, 2), point('Tue', 4), point('Tue', 1, 1), point('Tue', 2, 2)], ['Mon', 'Tue']);
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }
function stackedValues(chart) {
	return chart.getModel().getSeries().map(series => {
		const d = series.getData(), dimension = d.getCalculationInfo('stackResultDimension');
		return Array.from({ length: d.count() }, (_, i) => d.get(dimension, i));
	});
}

test('saved views default to grouped bars and malformed layout settings never enable stacking', () => {
	for (const value of [undefined, null, '', 'unknown', {}, [], true]) assert.equal(normalizeBarLayout(value), 'grouped');
	for (const value of ['stacked', 'percent']) assert.equal(normalizeBarLayout(value), value);
	const built = option(sample());
	assert.ok(built.series.every(series => series.stack === undefined));
	assert.deepEqual(built.series.map(series => series.data.map(d => d.value)), [[2, 4], [3, 1], [1, 2]]);
	assert.equal(built.series[0].label.position, 'top');
});

test('ordinary stacks keep contributions, source records, category order and palette indices', () => {
	const points = [point('Tue', 4, 2), point('Mon', 2), point('Mon', 3, 2)];
	const built = option(data(points, ['Tue', 'Mon']), 'stacked');
	assert.deepEqual(built.xAxis.data, ['Tue', 'Mon']);
	assert.deepEqual(built.series.map(s => s.itemStyle.color), [colors.palette[0], colors.palette[2]]);
	assert.deepEqual(built.series.map(s => s.data.map(d => d.value)), [[0, 2], [4, 3]]);
	assert.deepEqual(built.series.map(s => s.data.map(d => d._stackY)), [[0, 2], [4, 5]]);
	assert.equal(built.series[0].data[0]._raw, null);
	assert.equal(built.series[1].data[1]._raw, points[2]);
	assert.deepEqual(points.map(p => p.y), [4, 2, 3]);
});

test('100% stacks normalize each X independently and preserve the original file values', () => {
	const wrapper = sample();
	const built = option(wrapper, 'percent');
	assert.equal(built.yAxis.min, 0); assert.equal(built.yAxis.max, 100);
	assert.equal(built.yAxis.axisLabel.formatter, '{value}%');
	assert.equal(built.yAxis.interval, 25);
	assert.equal(built.series[0].label.formatter({ value: 100 / 3 }), '33.3%');
	close(built.series[0].data[0].value, 2 / 6 * 100);
	close(built.series[0].data[1].value, 4 / 7 * 100);
	for (const i of [0, 1]) close(built.series.reduce((sum, s) => sum + s.data[i].value, 0), 100);
	assert.equal(built.series[0].data[0]._raw.y, 2);
	assert.deepEqual(built.series[0].data[0]._raw.fileValues, [2]);
	assert.deepEqual(wrapper.data.map(p => p.y), [2, 3, 1, 4, 1, 2]);
});

test('zero totals and missing groups remain finite and create no synthetic source records', () => {
	const built = option(data([point('Zero', 0), point('Zero', 0, 1), point('Only', 5, 1)], ['Zero', 'Only']), 'percent');
	assert.deepEqual(built.series.map(s => s.data.map(d => d.value)), [[0, 0], [0, 100]]);
	assert.equal(built.series[0].data[1]._raw, null);
	assert.equal(built.series[0].data[0]._raw.y, 0);
	assert.equal(built.series[0].label.formatter({ value: 0 }), '');
});

test('stacking synchronizes cumulative ranges across measures; 100% keeps a fixed scale', () => {
	const points = [point('Mon', 5), point('Mon', 7, 1), point('Tue', -2), point('Tue', -4, 1), point('Mon', 20, 0, 1), point('Mon', 30, 1, 1)];
	const wrapper = data(points, ['Mon', 'Tue'], { synced: true });
	for (const i of [0, 1]) {
		const built = option(wrapper, 'stacked', i);
		assert.equal(built.yAxis.min, -6); assert.equal(built.yAxis.max, 50);
	}
	const partial = option(data(points, ['Mon', 'Tue'], { min: -10 }), 'stacked');
	assert.equal(partial.yAxis.min, -10); assert.equal(partial.yAxis.max, 12);
	const percent = option(data([point('Mon', 5)], ['Mon'], { min: -10, max: 999, synced: true }), 'percent');
	assert.equal(percent.yAxis.min, 0); assert.equal(percent.yAxis.max, 100);
	const view = new BarChartView();
	view.config = { get: () => 'stacked' };
	view.prepared = data(points, ['Mon', 'Tue'], { min: -4, max: 30, synced: true });
	view.overrides = { min: null, max: null, synced: true };
	assert.equal(option(view.processData(), 'stacked').yAxis.max, 50);
});

test('100% rejects signed aggregates per measure instead of silently changing their meaning', () => {
	const wrapper = data([point('Mon', -1), point('Mon', 5, 0, 1)], ['Mon']);
	const view = new BarChartView();
	view.config = { get: () => 'percent' };
	assert.match(view.getChartMessage(wrapper, 0), /non-negative/);
	assert.equal(view.getChartMessage(wrapper, 1), null);
	view.config = { get: () => 'stacked' };
	assert.equal(view.getChartMessage(wrapper, 0), null);
});

test('timestamp categories use canonical date identities when stacking', () => {
	const first = new Date('2026-10-25T00:00:00Z'), second = new Date('2026-10-26T00:00:00Z');
	const built = option(data([point(first, 2), point(new Date(first), 3, 1), point(second, 4)], [first, second], {}, 'time'), 'stacked');
	assert.deepEqual(built.series.map(s => s.data.map(d => d.value)), [[2, 4], [3, 0]]);
	assert.equal(built.series[1].data[0]._stackY, 5);
});

for (const layout of ['stacked', 'percent']) {
	test(`real ECharts renders ${layout} bars at the correct heights across phone and desktop sizes`, () => {
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 420 });
		try {
			chart.setOption({ ...option(sample(), layout), animation: false }, { notMerge: true });
			for (const width of [1000, 320, 390, 1000]) {
				chart.resize({ width, height: 420 });
				assert.doesNotMatch(chart.renderToSVGString(), /NaN|Infinity/);
				const values = stackedValues(chart);
				for (const [i, total] of [6, 7].entries()) close(values[2][i], layout === 'percent' ? 100 : total);
				for (const series of chart.getModel().getSeries()) {
					series.getData().each(index => {
						const rect = series.getData().getItemGraphicEl(index), label = rect?.getTextContent();
						if (!label || label.ignore || label.invisible) return;
						const text = label.style.text;
						const spans = label.childrenRef().filter(el => el.type === 'tspan' && el.style.text);
						if (!spans.length) return;
						assert.equal(spans.map(el => el.style.text).join(''), text, 'small segments hide labels entirely, never truncate the number');
					});
				}
			}
			chart.setOption({ ...option(sample()), animation: false }, { notMerge: true });
			assert.ok(chart.getOption().series.every(s => !s.stack), 'switching back removes all stack state');
			assert.notEqual(chart.getOption().yAxis[0].max, 100);
		} finally { chart.dispose(); }
	});
}

test('real ECharts signed stacks and zero anchors agree with tooltip positions', () => {
	const built = option(data([point('Mon', 5), point('Mon', -2, 1), point('Mon', 0, 2)], ['Mon']), 'stacked');
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 480, height: 320 });
	try {
		chart.setOption({ ...built, animation: false });
		assert.deepEqual(stackedValues(chart), [[5], [-2], [-2]]);
		assert.deepEqual(built.series.map(s => s.data.map(d => d._stackY)), stackedValues(chart));
	} finally { chart.dispose(); }
});
