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

function buildOption(type, data, xName = 'Folder / size / time →', yName = '↑ Amount (Sum)') {
	const args = [data, 0, xName, yName, data.hasMultipleGroups(), colors];
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

function assertTextFitsCanvas(chart) {
	const textSpans = chart.getZr().storage.getDisplayList(true).filter(element =>
		element.type === 'tspan' && !element.ignore && !element.invisible,
	);
	assert.ok(textSpans.length > 2, 'axis names and tick labels must remain rendered');
	for (const element of textSpans) {
		const bounds = element.getBoundingRect().clone();
		const transform = element.getComputedTransform();
		if (transform) bounds.applyTransform(transform);
		const description = `text ${JSON.stringify(element.style.text)} must fit ${chart.getWidth()}×${chart.getHeight()} canvas: ${JSON.stringify(bounds)}`;
		// Allow subpixel rasterization at the edge, while catching clipped names
		// and the full rotated bounds of long category labels.
		assert.ok(bounds.x >= -1 && bounds.y >= -1, description);
		assert.ok(bounds.x + bounds.width <= chart.getWidth() + 1, description);
		assert.ok(bounds.y + bounds.height <= chart.getHeight() + 1, description);
	}
	return textSpans.map(element => String(element.style.text));
}

function visibleBarLabelBounds(chart) {
	const labels = [];
	for (const series of chart.getModel().getSeries()) {
		chart.getViewOfSeriesModel(series).group.traverse(element => {
			const label = element.getTextContent?.();
			if (!label || element.ignore || element.invisible || label.ignore || label.invisible) return;
			const bounds = label.getBoundingRect().clone();
			const transform = label.getComputedTransform();
			if (transform) bounds.applyTransform(transform);
			labels.push({ text: String(label.style.text), bounds });
		});
	}
	return labels;
}

function overlappingLabelPairs(labels) {
	const pairs = [];
	for (let first = 0; first < labels.length; first++) {
		for (let second = first + 1; second < labels.length; second++) {
			const a = labels[first].bounds;
			const b = labels[second].bounds;
			const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
			const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
			if (width > 0 && height > 0) pairs.push([labels[first], labels[second]]);
		}
	}
	return pairs;
}

test('grouped bars hide colliding near-equal value labels without removing values or source files', () => {
	const categories = Array.from({ length: 8 }, (_, index) => `Project ${index + 1}`);
	const points = categories.flatMap((x, index) => [79, 80, 80].map((y, groupIndex) => ({
		x, y, groupIndex, chartIndex: 0, isNumeric: true,
		files: [`group-${groupIndex}/source-${index}.md`], fileValues: [y],
	})));
	const data = new PropertySeparatedData(points, ['First', 'Second', 'Third'], categories, 'category',
		{ min: null, max: null, synced: false }, ['note.amount'], new Map([['note.amount', 'Amount']]));
	const expectedValues = points.map(point => ({ value: point.y, raw: point }))
		.sort((a, b) => a.raw.files[0].localeCompare(b.raw.files[0]));
	const option = buildOption('bar', data);
	for (const width of [320, 586]) {
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height: 300 });
		try {
			// Demonstrate that this fixture actually triggers the original bug.
			const withoutOverlapHandling = {
				...option,
				animation: false,
				series: option.series.map(series => ({ ...series, labelLayout: { hideOverlap: false } })),
			};
			chart.setOption(withoutOverlapHandling, { notMerge: true });
			assertValidSvg(chart);
			assert.ok(overlappingLabelPairs(visibleBarLabelBounds(chart)).length > 0, `the ${width}px fixture must detect collisions when overlap handling is disabled`);

			chart.setOption({ ...option, animation: false }, { notMerge: true });
			assertValidSvg(chart);
			const labels = visibleBarLabelBounds(chart);
			assert.ok(labels.length > 0 && labels.length < points.length, 'only conflicting labels should be suppressed');
			assert.deepEqual(overlappingLabelPairs(labels), [], `visible data labels must not intersect at ${width}px`);
			const plottedValues = chart.getOption().series.flatMap(series => series.data)
				.map(point => ({ value: point.value, raw: point._raw }))
				.sort((a, b) => a.raw.files[0].localeCompare(b.raw.files[0]));
			assert.deepEqual(plottedValues, expectedValues, 'hiding labels must retain every plotted value and complete source-file metadata');
		} finally {
			chart.dispose();
		}
	}
});

for (const type of ['bar', 'line', 'scatter']) {
	for (const categoryCount of [8, 24]) {
		test(`${type} retains a usable plot and unclipped long labels and names through narrow/wide resize (${categoryCount} categories)`, () => {
			const xValues = Array.from({ length: categoryCount }, (_, index) => `Project ${index + 1} / Research / Distributed systems / A very long nested folder`);
			const data = makeData('category', true, xValues);
			const xName = 'Collection folder with a very long name covering research projects and nested folders →';
			const yName = '↑ Estimated duration of completed work across every research project and collection (Sum)';
			const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 300 });
			try {
				chart.setOption({ ...buildOption(type, data, xName, yName), animation: false }, { notMerge: true });
				for (const [width, height] of [[320, 300], [1000, 400], [320, 300]]) {
					chart.resize({ width, height });
					assertValidSvg(chart);
					const visibleText = assertTextFitsCanvas(chart);
					assert.ok(visibleText.some(text => text.startsWith('Collection folder')), 'the X name must remain visible');
					assert.ok(visibleText.some(text => text.startsWith('↑ Estimated duration')), 'the Y name must remain visible');
					assert.ok(visibleText.filter(text => text.startsWith('Project ')).length >= 2, 'long folder names must not suppress all but one category label');
					const grid = chart.getModel().getComponent('grid').coordinateSystem.getRect();
					assert.ok(grid.width > width / 2, 'long names must not crush the horizontal plot area');
					assert.ok(grid.height > height / 2, 'labels and names must leave useful vertical plot space');
					assert.equal(chart.getOption().xAxis[0].name, xName, 'visual truncation must preserve the complete X name');
					assert.equal(chart.getOption().yAxis[0].name, yName, 'visual truncation must preserve the complete Y name');
					assert.deepEqual(chart.getOption().xAxis[0].data, data.sortedXOrder, 'visual truncation must preserve category identity');
				}
			} finally {
				chart.dispose();
			}
		});
	}
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
