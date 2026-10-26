import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

const bundle = await build({
	stdin: {
		contents: `
			export { BarChartView, buildBarOption } from './src/dataCharts/charts/barChart';
			export { buildLineOption } from './src/dataCharts/charts/lineChart';
			export { buildAreaOption } from './src/dataCharts/charts/areaChart';
			export { buildScatterOption } from './src/dataCharts/charts/scatterChart';
			export { PropertySeparatedData } from './src/dataCharts/data';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{ name: 'date-gap-chart-boundaries', setup(builder) {
		builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host' }));
		builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian'
			? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
			: 'export class DataChartView {}',
		}));
	} }],
});
const { BarChartView, buildBarOption, buildLineOption, buildAreaOption, buildScatterOption, PropertySeparatedData } = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const colors = { palette: ['#5785B1', '#6D9875'], background: '#fff', text: '#222', mutedText: '#666', grid: '#ddd', accent: '#5785B1' };
const dates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
const point = (x, y, groupIndex = 0, chartIndex = 0) => ({
	x, y, groupIndex, chartIndex, isNumeric: true,
	files: [`${x}-${groupIndex}-${chartIndex}.md`], fileValues: [y],
});
function data(points, { enabled = true, descending = false, error = null } = {}) {
	const categories = descending ? dates.toReversed() : dates;
	return new PropertySeparatedData(points, ['Reading', 'Exercise'], categories, 'category',
		{ min: null, max: null, synced: false }, ['note.minutes', 'note.score'],
		new Map([['note.minutes', 'Minutes'], ['note.score', 'Score']]),
		enabled ? { categories, error } : null);
}
function sample(options) {
	return data([point(dates[0], 2), point(dates[3], 0), point(dates[6], 3), point(dates[0], 4, 1), point(dates[6], 6, 1)], options);
}
const builders = {
	grouped: wrapper => buildBarOption(wrapper, 0, 'Date', 'Minutes', true, colors, true, false, false, 'grouped'),
	stacked: wrapper => buildBarOption(wrapper, 0, 'Date', 'Minutes', true, colors, true, false, false, 'stacked'),
	percent: wrapper => buildBarOption(wrapper, 0, 'Date', 'Minutes', true, colors, true, false, false, 'percent'),
	line: wrapper => buildLineOption(wrapper, 0, 'Date', 'Minutes', true, colors, false),
	area: wrapper => buildAreaOption(wrapper, 0, 'Date', 'Minutes', true, colors),
	scatter: wrapper => buildScatterOption(wrapper, 0, 'Date', 'Minutes', true, colors, true),
};

for (const [kind, buildOption] of Object.entries(builders)) {
	test(`${kind} preserves calendar positions and source data without inventing observations`, () => {
		const wrapper = sample();
		const built = buildOption(wrapper);
		assert.deepEqual(built.xAxis.data, dates);
		assert.deepEqual(built.series.flatMap(series => series.data.flatMap(d => d._raw?.files ?? [])).sort(),
			wrapper.data.flatMap(point => point.files).sort());
		assert.equal(wrapper.data.length, 5);
		assert.deepEqual(buildOption(sample({ descending: true })).xAxis.data, dates.toReversed());
		assert.deepEqual(buildOption(sample({ enabled: false })).xAxis.data, [dates[0], dates[3], dates[6]], 'existing compact views stay compact');
	});
}

for (const kind of ['grouped', 'stacked', 'percent']) {
	test(`${kind} bars distinguish empty periods and absent groups from real zero values`, () => {
		const built = builders[kind](sample());
		for (const series of built.series) {
			for (const index of [1, 2, 4, 5]) {
				assert.equal(series.data[index].value, null);
				assert.equal(series.data[index]._raw, null);
			}
			assert.equal(series.label.formatter({ value: null }), '', 'missing dates have no zero label');
		}
		assert.equal(built.series[0].data[3].value, 0);
		assert.equal(built.series[0].data[3]._raw.y, 0);
		assert.deepEqual(built.series[0].data[3]._raw.fileValues, [0]);
		assert.equal(built.series[1].data[3].value, null);
		if (kind === 'percent') {
			assert.equal(built.yAxis.max, 100);
			assert.ok(Math.abs(built.series.reduce((sum, s) => sum + s.data[0].value, 0) - 100) < 1e-8);
		}
	});
}

test('line gaps break the line, while explicit zero filling remains a display-only choice', () => {
	const wrapper = sample();
	const gap = builders.line(wrapper);
	assert.equal(gap.series[0].connectNulls, false);
	assert.deepEqual(gap.series[0].data.map(d => d.value), [2, null, null, 0, null, null, 3]);
	const zeros = buildLineOption(wrapper, 0, 'Date', 'Minutes', true, colors, true);
	assert.deepEqual(zeros.series[0].data.map(d => d.value), [2, 0, 0, 0, 0, 0, 3]);
	assert.equal(zeros.series[0].data[1]._raw, null);
	assert.equal(zeros.series[0].data[3]._raw.y, 0);
});

test('stacked area breaks whole missing periods while aligning absent groups at populated periods', () => {
	const built = builders.area(sample());
	assert.deepEqual(built.series.map(series => series.data.map(d => d.value)), [
		[2, null, null, 0, null, null, 3],
		[4, null, null, 0, null, null, 6],
	]);
	assert.equal(built.series[0].data[3]._raw.y, 0);
	assert.equal(built.series[1].data[3]._raw, null);
	assert.ok(built.series.every(series => series.connectNulls === false));
});

test('all Y measures share date bounds even when only one measure has data at an edge', () => {
	const wrapper = data([point(dates[0], 5), point(dates[6], 7, 0, 1)]);
	for (const index of [0, 1]) {
		const built = buildLineOption(wrapper, index, 'Date', 'Measure', false, colors, false);
		assert.deepEqual(built.xAxis.data, dates);
		assert.equal(built.series[0].data[index === 0 ? 6 : 0].value, null);
	}
});

test('bar range errors are retained alongside the 100% layout validation', () => {
	const view = new BarChartView();
	view.config = { get: () => 'percent' };
	assert.equal(view.getChartMessage(data([point(dates[0], -2)], { error: 'Choose a larger date grouping.' }), 0), 'Choose a larger date grouping.');
	assert.match(view.getChartMessage(data([point(dates[0], -2)]), 0), /non-negative/);
});

for (const [kind, buildOption] of Object.entries(builders)) {
	test(`real ECharts renders ${kind} chronological gaps at phone and desktop widths`, () => {
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 420 });
		try {
			chart.setOption({ ...buildOption(sample()), animation: false }, { notMerge: true });
			for (const width of [1000, 390]) {
				chart.resize({ width, height: 420 });
				assert.doesNotMatch(chart.renderToSVGString(), /NaN|Infinity/);
				const x = dates.map(date => chart.convertToPixel({ xAxisIndex: 0 }, date));
				assert.ok(Math.abs((x[6] - x[0]) / (x[1] - x[0]) - 6) < 1e-8, 'six days remain six equal calendar intervals');
				if (kind !== 'scatter') {
					for (const series of chart.getModel().getSeries()) {
						for (const index of [1, 2, 4, 5]) assert.equal(series.getData().hasValue(index), false);
					}
					assert.equal(chart.getModel().getSeries()[0].getData().hasValue(3), true, 'real zero remains a value');
				}
			}
		} finally { chart.dispose(); }
	});
}
