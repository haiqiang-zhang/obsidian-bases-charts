import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

const bundle = await build({
	stdin: {
		contents: `
			export { buildBarOption } from './src/dataCharts/charts/barChart';
			export { buildLineOption } from './src/dataCharts/charts/lineChart';
			export { buildAreaOption } from './src/dataCharts/charts/areaChart';
			export { buildScatterOption } from './src/dataCharts/charts/scatterChart';
			export { buildPieOption } from './src/dataCharts/charts/pieChart';
			export { buildRadarOption, RadarChartView } from './src/dataCharts/charts/radarChart';
			export { PropertySeparatedData } from './src/dataCharts/data';
			export { getGroupColor } from './src/ui/colors';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{ name: 'group-color-rendering-boundaries', setup(builder) {
		builder.onResolve({ filter: /^echarts$/ }, () => ({ path: import.meta.resolve('echarts'), external: true }));
		builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host' }));
		builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian'
			? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
			: 'export class DataChartView {}',
		}));
	} }],
});
const { buildBarOption, buildLineOption, buildAreaOption, buildScatterOption, buildPieOption, buildRadarOption, RadarChartView,
	PropertySeparatedData, getGroupColor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const colors = { palette: ['#5785B1', '#6D9875', '#B99A4F', '#C27A62'], background: '#fff', text: '#222', mutedText: '#666', grid: '#ddd', accent: '#5785B1' };
const custom = '#9467BD';
const overrideColors = { ...colors, groupColors: new Map([[0, custom]]) };
const categories = ['Monday', 'Tuesday', 'Wednesday'];
function sample(groupCount = 2, measureCount = 2, isGrouped = groupCount > 1) {
	const groups = ['Reading', 'Exercise'].slice(0, groupCount);
	const properties = ['note.minutes', 'note.score'].slice(0, measureCount);
	const points = properties.flatMap((_, chartIndex) => groups.flatMap((_, groupIndex) => categories.map((x, i) => ({
		x, y: 10 * (chartIndex + 1) + i + groupIndex, groupIndex, chartIndex, isNumeric: true,
		files: [`${x}-${groupIndex}-${chartIndex}.md`], fileValues: [10 * (chartIndex + 1) + i + groupIndex],
	}))));
	return new PropertySeparatedData(points, groups, categories, 'category',
		{ min: null, max: null, synced: false }, properties,
		new Map([['note.minutes', 'Minutes'], ['note.score', 'Score']]), null, isGrouped);
}
const builders = {
	grouped: (data, palette) => buildBarOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette, true, false, false, 'grouped'),
	stacked: (data, palette) => buildBarOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette, true, false, false, 'stacked'),
	percent: (data, palette) => buildBarOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette, true, false, false, 'percent'),
	line: (data, palette) => buildLineOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette, false),
	area: (data, palette) => buildAreaOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette),
	scatter: (data, palette) => buildScatterOption(data, 0, 'Day', 'Minutes', data.hasMultipleGroups(), palette, true),
	pie: (data, palette) => buildPieOption(data, 0, palette, true, false, true),
	radar: (data, palette) => buildRadarOption(data, palette),
};
const rawData = option => option.series.flatMap(series => series.data.map(d => d._raw));

for (const [kind, buildOption] of Object.entries(builders)) {
	test(`${kind} applies explicit group colors without changing source data or automatic neighbors`, () => {
		const data = sample();
		const baseline = buildOption(data, colors);
		const actual = buildOption(data, overrideColors);
		assert.deepEqual(rawData(actual), rawData(baseline));
		if (kind === 'pie') {
			assert.deepEqual(actual.series[0].data.map(d => d.itemStyle.color), [custom, custom, custom, colors.palette[1], colors.palette[1], colors.palette[1]]);
		} else {
			assert.equal(actual.series[0].itemStyle.color, custom);
			assert.equal(actual.series[1].itemStyle.color, colors.palette[1]);
			if (kind === 'line' || kind === 'area' || kind === 'radar') assert.equal(actual.series[0].lineStyle.color, custom);
			if (kind === 'area' || kind === 'radar') assert.equal(actual.series[0].areaStyle.color, custom);
		}
		const changedPalette = { ...overrideColors, palette: ['#D0B575', '#8DBFB9', '#88B0D2', '#9BBDA0'], accent: '#D0B575' };
		const changed = buildOption(data, changedPalette);
		assert.equal(kind === 'pie' ? changed.series[0].data[0].itemStyle.color : changed.series[0].itemStyle.color, custom,
			'explicit overrides survive a palette change');
		assert.deepEqual(overrideColors.groupColors, new Map([[0, custom]]));
	});

	test(`${kind} preserves an override when filtering leaves a single group`, () => {
		const actual = buildOption(sample(1, 1), overrideColors);
		if (kind === 'pie') assert.ok(actual.series[0].data.every(d => d.itemStyle.color === custom));
		else assert.ok(actual.series.every(series => series.itemStyle.color === custom));
	});

	test(`real ECharts uses ${kind} overrides for plotted marks and tooltip visuals`, () => {
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 840, height: 460 });
		try {
			chart.setOption({ ...buildOption(sample(), overrideColors), animation: false }, { notMerge: true });
			assert.doesNotMatch(chart.renderToSVGString(), /NaN|Infinity/);
			assert.equal(chart.getVisual({ seriesIndex: 0, dataIndex: 0 }, 'color'), custom);
			const next = kind === 'pie' ? { seriesIndex: 0, dataIndex: 3 } : { seriesIndex: 1, dataIndex: 0 };
			assert.equal(chart.getVisual(next, 'color'), colors.palette[1]);
			chart.resize({ width: 390, height: 420 });
			assert.doesNotMatch(chart.renderToSVGString(), /NaN|Infinity/);
			assert.equal(chart.getVisual({ seriesIndex: 0, dataIndex: 0 }, 'color'), custom);
		} finally { chart.dispose(); }
	});
}

test('automatic pie slices and radar profiles retain their existing independent palette indices', () => {
	const pie = buildPieOption(sample(1, 1), 0, colors, false, false, true);
	assert.deepEqual(pie.series[0].data.map(d => d.itemStyle.color), colors.palette.slice(0, 3));
	const radar = buildRadarOption(sample(), colors);
	assert.deepEqual(radar.series.map(s => s.itemStyle.color), colors.palette);
	assert.ok(radar.series.every(series => series.symbol === 'circle' && series.lineStyle.type === undefined));
});

test('an explicitly grouped single-group pie keeps its group color and names', () => {
	const pie = buildPieOption(sample(1, 1, true), 0, colors, false, false, true);
	assert.deepEqual(pie.series[0].data.map(d => d.itemStyle.color), categories.map(() => colors.palette[0]));
	assert.deepEqual(pie.series[0].data.map(d => d.name), categories.map(category => `Reading · ${category}`));
});

test('an explicitly grouped single-group radar retains its group names and legend identity', () => {
	const single = sample(1, 1, true);
	assert.deepEqual(buildRadarOption(single, colors).series.map(s => s.name), ['Reading']);
	const multiple = sample(1, 2, true);
	assert.deepEqual(buildRadarOption(multiple, colors).series.map(s => s.name), ['Minutes · Reading', 'Score · Reading']);
	const legend = RadarChartView.prototype.getChartLegend(multiple);
	assert.deepEqual(legend.map(({ name, colorIndex, groupIndex }) => ({ name, colorIndex, groupIndex })), [
		{ name: 'Minutes · Reading', colorIndex: 0, groupIndex: 0 },
		{ name: 'Score · Reading', colorIndex: 1, groupIndex: 0 },
	]);
});

test('multi-measure radar profiles share their group color and distinguish measures by line and symbol', () => {
	const option = buildRadarOption(sample(), overrideColors);
	assert.deepEqual(option.series.map(s => s.itemStyle.color), [custom, colors.palette[1], custom, colors.palette[3]]);
	assert.deepEqual(option.series.map(s => s.name), ['Minutes · Reading', 'Minutes · Exercise', 'Score · Reading', 'Score · Exercise']);
	assert.deepEqual(option.series.filter((_, i) => i % 2 === 0).map(s => [s.lineStyle.type, s.symbol]), [['solid', 'circle'], ['dashed', 'rect']]);
	assert.ok(option.series.filter((_, i) => i % 2 === 1).every(s => s.lineStyle.type === undefined && s.symbol === 'circle'));
	const onlyOneGroup = buildRadarOption(sample(1, 2), overrideColors);
	assert.deepEqual(onlyOneGroup.series.map(s => s.itemStyle.color), [custom, custom]);
	assert.notEqual(onlyOneGroup.series[0].lineStyle.type, onlyOneGroup.series[1].lineStyle.type);
});

test('radar legend patterns match custom profile lines and symbols without changing automatic swatches', () => {
	const data = sample();
	const option = buildRadarOption(data, overrideColors);
	const legend = RadarChartView.prototype.getChartLegend(data, overrideColors);
	for (const [index, entry] of legend.entries()) {
		const series = option.series[index];
		if (entry.groupIndex === 0) {
			assert.equal(entry.lineStyle, series.lineStyle.type);
			assert.equal(entry.symbol, series.symbol);
		} else {
			assert.equal(entry.lineStyle, undefined);
			assert.equal(entry.symbol, undefined);
		}
	}
	assert.deepEqual(legend.filter(entry => entry.groupIndex === 0).map(entry => [entry.lineStyle, entry.symbol]),
		[['solid', 'circle'], ['dashed', 'rect']]);
	for (const entry of RadarChartView.prototype.getChartLegend(data, colors)) {
		assert.equal(entry.lineStyle, undefined);
		assert.equal(entry.symbol, undefined);
	}
	const singleMeasure = RadarChartView.prototype.getChartLegend(sample(1, 1, true), overrideColors);
	assert.equal(singleMeasure[0].lineStyle, undefined);
	assert.equal(singleMeasure[0].symbol, undefined);
});

test('shared color resolver preserves automatic accent, palette and explicit fallback rules', () => {
	assert.equal(getGroupColor(colors, 0, false), colors.accent);
	assert.equal(getGroupColor(colors, 1, true), colors.palette[1]);
	assert.equal(getGroupColor(colors, 0, false, 2), colors.palette[2]);
	assert.equal(getGroupColor(overrideColors, 0, false, 2), custom);
	assert.equal(getGroupColor({ ...colors, palette: [] }, 0, true, 1), colors.accent);
	assert.equal(getGroupColor({ ...colors, palette: [] }, 0, true), colors.accent);
});
