import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

// Exercise the real chart option builder outside Obsidian. Only the host's
// value classes and the view lifecycle are stubbed; no chart logic is mocked.
const result = await build({
	entryPoints: [fileURLToPath(new URL('../src/dataCharts/charts/pieChart.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'obsidian-host-stubs',
		setup(build) {
			build.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			build.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian'
					? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
					: 'export class DataChartView {}',
				loader: 'js',
			}));
		},
	}],
});
const { buildPieOption } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const colors = { palette: ['blue', 'orange', 'green'], background: 'white', text: 'black', grid: 'gray', accent: 'purple' };

function point(x, y, groupIndex = 0) {
	return { x, y, groupIndex, chartIndex: 0, isNumeric: true, files: [`${groupIndex}-${x}.md`], fileValues: [y] };
}

function wrapper(points, groups) {
	return {
		xAxisType: 'category',
		getFlat: () => points,
		hasMultipleGroups: () => groups.length > 1,
		getGroupName: index => groups[index],
	};
}

test('grouped pie separates repeated X labels and aligns slice colors with group legend', () => {
	// Flat data is sorted by X, so groups can arrive interleaved.
	const points = [point('A', 2, 1), point('A', 3, 0), point('B', 4, 1), point('B', 5, 0)];
	const option = buildPieOption(wrapper(points, ['Second', 'First']), 0, colors, true, true, true);
	const slices = option.series[0].data;
	assert.deepEqual(slices.map(slice => slice.name), ['Second · A', 'Second · B', 'First · A', 'First · B']);
	assert.deepEqual(slices.map(slice => slice.itemStyle.color), ['blue', 'blue', 'orange', 'orange']);
	assert.deepEqual(slices.map(slice => slice.value), [3, 5, 2, 4]);
	assert.equal(slices[0]._raw, points[1]);
	assert.deepEqual(points.map(point => point.groupIndex), [1, 0, 1, 0], 'must not reorder the shared data cache');
});

test('ungrouped pie keeps X labels, category colors, and values unchanged', () => {
	const points = [point('Folder A', 3), point('Folder B', 7)];
	const option = buildPieOption(wrapper(points, []), 0, colors, true, false, true);
	assert.deepEqual(option.series[0].data.map(slice => [slice.name, slice.itemStyle.color, slice.value]), [
		['Folder A', 'blue', 3], ['Folder B', 'orange', 7],
	]);
});

test('empty groups do not shift palette identity or create duplicate slices', () => {
	const points = [point('Task', 2, 2)];
	const option = buildPieOption(wrapper(points, ['Empty', 'Also empty', 'Visible']), 0, colors, true, false, true);
	assert.deepEqual(option.series[0].data.map(slice => [slice.name, slice.itemStyle.color]), [['Visible · Task', 'green']]);
});

function visibleText(chart) {
	return chart.getZr().storage.getDisplayList(true).filter(element => element.type === 'tspan' && !element.ignore && !element.invisible);
}

function assertTextFits(chart) {
	for (const element of visibleText(chart)) {
		const bounds = element.getBoundingRect().clone();
		const transform = element.getComputedTransform();
		if (transform) bounds.applyTransform(transform);
		assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= chart.getWidth() + 1 && bounds.y + bounds.height <= chart.getHeight() + 1,
			`${JSON.stringify(element.style.text)} overflows ${chart.getWidth()}×${chart.getHeight()}: ${JSON.stringify(bounds)}`);
	}
}

for (const showPercentages of [false, true]) {
	test(`phone pie names remain complete with percentages ${showPercentages ? 'enabled' : 'disabled'} and restore desktop formatting`, () => {
		const points = [point('Design', 294), point('Engineering', 377), point('Research', 270), point('Writing', 191)];
		const option = buildPieOption(wrapper(points, []), 0, colors, true, showPercentages, true);
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 300 });
		try {
			chart.setOption({ ...option, animation: false }, { notMerge: true });
			for (const [width, height] of [[320, 300], [320, 340], [374, 300], [374, 340], [1200, 500], [240, 300], [320, 300], [1200, 500]]) {
				chart.resize({ width, height });
				assertTextFits(chart);
				const series = chart.getOption().series[0];
				assert.deepEqual(series.data.map(slice => ({ name: slice.name, value: slice.value, raw: slice._raw })),
					points.map(point => ({ name: point.x, value: point.y, raw: point })), 'formatting must preserve full category names, values, and selection metadata');
				if (width >= 280 && width <= 519) {
					const text = visibleText(chart).map(element => element.style.text);
					for (const point of points) assert.ok(text.includes(point.x), `${point.x} must render in full at ${width}×${height}: ${JSON.stringify(text)}`);
					assert.equal(series.label.formatter, showPercentages ? '{b}\n{d}%' : '{b}');
					if (showPercentages) assert.equal(text.filter(value => /^\d+(?:\.\d+)?%$/.test(value)).length, points.length, 'every percentage must have its own complete line');
				} else if (width > 519) {
					assert.equal(series.label.formatter, option.series[0].label.formatter);
					assert.equal(series.label.width, undefined);
					assert.equal(series.label.lineHeight, undefined);
					assert.equal(series.label.alignTo, 'none');
					assert.deepEqual(series.radius, ['44%', '76%']);
					assert.equal(series.labelLine.length, 15);
					assert.equal(series.labelLine.length2, 15);
				}
			}
		} finally { chart.dispose(); }
	});
}

test('phone media never enables labels when the view disables them', () => {
	const points = [point('Design', 4), point('Engineering', 3), point('Research', 2), point('Writing', 1)];
	const option = buildPieOption(wrapper(points, []), 0, colors, false, true, true);
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 300 });
	try {
		chart.setOption({ ...option, animation: false }, { notMerge: true });
		for (const width of [320, 374, 1000, 240]) {
			chart.resize({ width, height: 300 });
			assert.equal(chart.getOption().series[0].label.show, false);
			assert.equal(chart.getOption().series[0].labelLine.show, false);
			assert.equal(visibleText(chart).length, 0);
		}
	} finally { chart.dispose(); }
});
