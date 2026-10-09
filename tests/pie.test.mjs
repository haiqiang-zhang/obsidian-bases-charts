import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

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
