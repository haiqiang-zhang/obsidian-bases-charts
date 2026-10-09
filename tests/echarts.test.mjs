import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

// Keep the real ECharts package, builders, axis helpers, and data wrapper. Only
// Obsidian's runtime classes and the chart-view lifecycle are host boundaries.
const result = await build({
	stdin: {
		contents: `
			export { buildBarOption } from './src/dataCharts/charts/barChart.ts';
			export { buildLineOption } from './src/dataCharts/charts/lineChart.ts';
			export { buildScatterOption } from './src/dataCharts/charts/scatterChart.ts';
			export { buildPieOption } from './src/dataCharts/charts/pieChart.ts';
			export { PropertySeparatedData } from './src/dataCharts/data.ts';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'obsidian-host-only',
		setup(builder) {
			builder.onResolve({ filter: /^echarts$/ }, () => ({ path: import.meta.resolve('echarts'), external: true }));
			builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian'
					? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
					: 'export class DataChartView {}',
			}));
		},
	}],
});
const { buildBarOption, buildLineOption, buildScatterOption, buildPieOption, PropertySeparatedData } = await import(
	`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=echarts-builders-under-test.mjs`).toString('base64')}`,
);

const colors = { palette: ['#3366cc', '#ee8833', '#33aa66'], background: '#fff', text: '#222', grid: '#ccc', accent: '#8866cc' };
const values = {
	category: ['/', 'Projects/Long folder name', 'Study'],
	value: [1000, 1500, 2000],
	time: [new Date('2026-10-07T12:00:00Z'), new Date('2026-10-08T12:00:00Z'), new Date('2026-10-09T12:00:00Z')],
};

function makeData(axisType, grouped = false, xValues = values[axisType]) {
	const points = xValues.flatMap((x, index) => (grouped ? [0, 1] : [0]).map(groupIndex => ({
		x, y: (index + 1) * (groupIndex + 1), groupIndex, chartIndex: 0,
		isNumeric: true, files: [`group-${groupIndex}/source-${index}.md`], fileValues: [(index + 1) * (groupIndex + 1)],
	})));
	return new PropertySeparatedData(points, grouped ? ['First', 'Second'] : [], xValues, axisType,
		{ min: null, max: null, synced: false }, ['note.amount'], new Map([['note.amount', 'Amount']]));
}

function buildOption(type, data) {
	const args = [data, 0, 'Folder / size / time →', '↑ Amount (Sum)', data.hasMultipleGroups(), colors];
	if (type === 'bar') return buildBarOption(...args, true, false, false);
	if (type === 'line') return buildLineOption(...args, false);
	if (type === 'scatter') return buildScatterOption(...args, false);
	return buildPieOption(data, 0, colors, true, false, true);
}

function assertValidSvg(chart) {
	const svg = chart.renderToSVGString();
	assert.match(svg, /^<svg\b/);
	assert.match(svg, /<path\b/);
	assert.doesNotMatch(svg, /NaN|Infinity/);
	return svg;
}

for (const [type, axisType] of [
	['bar', 'category'], ['line', 'category'], ['scatter', 'category'], ['pie', 'category'],
	['bar', 'value'], ['bar', 'time'], ['line', 'value'], ['line', 'time'], ['scatter', 'value'], ['scatter', 'time'],
]) {
	test(`real ECharts renders ${type} with ${axisType} X at narrow and wide sizes`, () => {
		const data = makeData(axisType, true);
		const option = buildOption(type, data);
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 300 });
		try {
			chart.setOption({ ...option, animation: false }, { notMerge: true });
			assertValidSvg(chart);
			const series = chart.getOption().series;
			const renderedPoints = series.flatMap(series => series.data).filter(point => point._raw);
			assert.equal(renderedPoints.length, data.data.length);
			assert.deepEqual(renderedPoints.flatMap(point => point._raw.files).sort(), data.data.flatMap(point => point.files).sort());
			assert.ok(renderedPoints.every(point => {
				const y = Array.isArray(point.value) ? point.value[1] : point.value;
				return y === point._raw.y && y > 0;
			}), 'each visible value must retain its source value and file metadata');
			if (type !== 'pie') {
				assert.equal(chart.getOption().xAxis[0].type, type === 'bar' ? 'category' : axisType);
			}
			chart.resize({ width: 1100, height: 650 });
			assert.equal(chart.getWidth(), 1100);
			assert.equal(chart.getHeight(), 650);
			assertValidSvg(chart);
		} finally {
			chart.dispose();
		}
	});
}

test('bar dates and compact numeric categories retain nonzero values and original order', () => {
	for (const axisType of ['time', 'value']) {
		const data = makeData(axisType);
		const option = buildOption('bar', data);
		assert.deepEqual(option.xAxis.data, data.sortedXOrder);
		assert.deepEqual(option.series[0].data.map(point => point.value), [1, 2, 3]);
		assert.deepEqual(option.series[0].data.map(point => point._raw.x), values[axisType]);
	}
});

test('notMerge replaces groups, chart type, and axes without stale ECharts series', () => {
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 500, height: 360 });
	try {
		chart.setOption({ ...buildOption('bar', makeData('category', true)), animation: false }, { notMerge: true });
		assert.equal(chart.getOption().series.length, 2);
		chart.setOption({ ...buildOption('line', makeData('time')), animation: false }, { notMerge: true });
		const updated = chart.getOption();
		assert.equal(updated.series.length, 1);
		assert.equal(updated.series[0].type, 'line');
		assert.equal(updated.xAxis[0].type, 'time');
		assert.deepEqual(updated.series[0].data.map(point => point.value), values.time.map((x, index) => [x.getTime(), index + 1]));
		assertValidSvg(chart);
		chart.setOption({ ...buildOption('pie', makeData('category')), animation: false }, { notMerge: true });
		assert.equal(chart.getOption().series[0].type, 'pie');
		assert.equal(chart.getOption().xAxis?.length ?? 0, 0);
		assertValidSvg(chart);
	} finally {
		chart.dispose();
	}
	assert.equal(chart.isDisposed(), true);
});

for (const [axisType, xValues] of [
	['time', [new Date('2026-10-09T08:00:00.000Z'), new Date('2026-10-09T09:00:00.000Z')]],
	['value', [12345, 12346]],
]) {
	test(`real ECharts preserves nearby ${axisType} X positions in bar, line, and scatter`, () => {
		const data = makeData(axisType, false, xValues);
		assert.equal(new Set(data.sortedXOrder).size, 2);
		for (const type of ['bar', 'line', 'scatter']) {
			const option = buildOption(type, data);
			if (type === 'bar') {
				assert.equal(new Set(option.xAxis.data).size, 2);
				assert.deepEqual(option.series[0].data.map(point => point.value), [1, 2]);
				if (axisType === 'time') {
					assert.notEqual(option.xAxis.axisLabel.formatter(data.sortedXOrder[0]), option.xAxis.axisLabel.formatter(data.sortedXOrder[1]));
				}
			}
			const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 480, height: 320 });
			try {
				chart.setOption({ ...option, animation: false }, { notMerge: true });
				assertValidSvg(chart);
				const points = chart.getOption().series[0].data;
				assert.equal(points.length, 2);
				assert.deepEqual(points.map(point => Array.isArray(point.value) ? point.value[1] : point.value), [1, 2]);
				const positions = type === 'bar' ? data.sortedXOrder : xValues.map(value => value instanceof Date ? value.getTime() : value);
				assert.notEqual(chart.convertToPixel({ xAxisIndex: 0 }, positions[0]), chart.convertToPixel({ xAxisIndex: 0 }, positions[1]));
			} finally {
				chart.dispose();
			}
		}
	});
}
