import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as echarts from 'echarts';

const bundled = await build({
	stdin: {
		contents: `
			export { buildRadarOption, getRadarCategories, getRadarSeries, RadarChartView } from './src/dataCharts/charts/radarChart.ts';
			export { PropertySeparatedData } from './src/dataCharts/data.ts';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'radar-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^echarts$/ }, () => ({ path: import.meta.resolve('echarts'), external: true }));
			builder.onResolve({ filter: /^(obsidian|\.\.\/dataChartView)$/ }, args => ({ path: args.path, namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian'
				? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
				: 'export class DataChartView {}',
			}));
		},
	}],
});
const { buildRadarOption, getRadarCategories, getRadarSeries, RadarChartView, PropertySeparatedData } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);
const colors = { palette: ['#6587a4', '#bd9b60', '#859d85', '#a78384'], background: '#fff', text: '#222', mutedText: '#666', grid: '#ddd', accent: '#6587a4' };

function point(x, y, chartIndex = 0, groupIndex = 0) {
	return { x, y, chartIndex, groupIndex, isNumeric: true, files: [`${chartIndex}-${groupIndex}-${String(x)}.md`], fileValues: [y] };
}
function data(points, categories = ['Sales', 'Support', 'Development'], properties = ['Budget', 'Spending'], groups = [], axisType = 'category') {
	const ids = properties.map(property => `note.${property}`);
	return new PropertySeparatedData(points, groups, categories, axisType,
		{ min: null, max: null, synced: false }, ids, new Map(ids.map((id, index) => [id, properties[index]])));
}

test('radar overlays selected measures and native groups with stable palette identities and a common spoke order', () => {
	const categories = ['Support', 'Sales', 'Development'];
	const points = [point('Sales', 8, 1, 2), point('Development', 12, 0, 0), point('Support', 4, 1, 2), point('Sales', 10, 0, 0), point('Support', 6, 0, 0)];
	const wrapper = data(points, categories, ['Budget', 'Spending'], ['Current', 'Empty', 'Future']);
	const option = buildRadarOption(wrapper, colors);
	assert.equal(RadarChartView.prototype.getChartCount.call({}, wrapper), 1);
	assert.deepEqual(getRadarSeries(wrapper).map(profile => [profile.name, profile.colorIndex]), [['Budget · Current', 0], ['Spending · Future', 5]]);
	assert.deepEqual(option.radar.indicator.map(axis => axis.name), categories);
	assert.deepEqual(option.series.map(series => series.data[0].value), [[6, 10, 12], [4, 8, 0]]);
	assert.deepEqual(option.series.map(series => series.itemStyle.color), [colors.palette[0], colors.palette[1]]);
	assert.equal(option.series[0].type, 'radar');
	assert.equal(option.series[1].name, 'Spending · Future');
	assert.equal(option.xAxis, undefined, 'radar must use the Apache radar coordinate system');
	assert.equal(option.yAxis, undefined);
	assert.deepEqual(points.map(point => point.chartIndex), [1, 0, 1, 0, 0], 'must not reorder the underlying data');
});

test('radar preserves per-spoke source data and distinguishes a missing value from a real zero', () => {
	const first = point('Sales', 0);
	const second = point('Support', 12);
	const other = point('Development', 40, 1);
	const option = buildRadarOption(data([first, second, other]), colors);
	const raw = option.series[0].data[0]._raw;
	assert.deepEqual(option.series[0].data[0].value, [0, 12, 0]);
	assert.deepEqual(raw.radar.values.map(item => item.value), [0, 12, null]);
	assert.equal(raw.radar.values[0].point, first);
	assert.equal(raw.radar.values[1].point, second);
	assert.equal(raw.radar.values[2].point, null);
	assert.deepEqual(raw.files, [...first.files, ...second.files]);
	assert.deepEqual(raw.fileValues, [0, 12]);
	assert.equal(raw.radar.name, 'Budget');
	assert.equal(raw.radar.property, 'Budget');
	assert.equal(raw.y, 0, 'the radar selection carries no fabricated total across categories');
});

test('shared scale preserves category magnitudes; per-category ranges contain negative, positive, and zero values', () => {
	const wrapper = data([point('Sales', -6), point('Support', 0), point('Development', 80), point('Sales', -3, 1), point('Support', 0, 1), point('Development', 100, 1)]);
	const shared = buildRadarOption(wrapper, colors).radar.indicator;
	assert.ok(shared.every(axis => axis.min === shared[0].min && axis.max === shared[0].max));
	assert.ok(shared[0].min <= -6 && shared[0].max >= 100);
	const category = buildRadarOption(wrapper, colors, { scale: 'category', showFill: false });
	const ranges = category.radar.indicator;
	assert.ok(ranges[0].min <= -6 && ranges[0].max >= 0);
	assert.deepEqual([ranges[1].min, ranges[1].max], [0, 1], 'all-zero spokes must have a nondegenerate range');
	assert.ok(ranges[2].min === 0 && ranges[2].max >= 100);
	assert.ok(category.series.every(series => series.areaStyle.opacity === 0));
	assert.ok(category.series.every(series => series.emphasis.areaStyle.opacity === 0));
});

test('radar handles numeric and timestamp categories without collapsing distinct spokes and excludes nonfinite measurements', () => {
	for (const [axisType, categories] of [
		['value', [12345, 12346, 12347]],
		['time', [new Date('2026-10-25T09:00:00Z'), new Date('2026-10-25T10:00:00Z'), new Date('2026-10-25T11:00:00Z')]],
	]) {
		const wrapper = data(categories.map((category, index) => point(category, index)), categories, ['Value'], [], axisType);
		assert.equal(new Set(getRadarCategories(wrapper)).size, 3);
		const option = buildRadarOption(wrapper, colors);
		assert.equal(new Set(option.radar.indicator.map(axis => axis.name)).size, 3);
		assert.deepEqual(option.series[0].data[0].value, [0, 1, 2]);
	}
	const invalid = data([point('Sales', Infinity), point('Support', NaN), point('Development', 5)]);
	assert.deepEqual(getRadarCategories(invalid), ['Development']);
	assert.deepEqual(buildRadarOption(invalid, colors).series, []);
	assert.match(RadarChartView.prototype.getChartMessage.call({}, invalid, 0), /at least three/);
});

function assertTextFits(chart) {
	for (const element of chart.getZr().storage.getDisplayList(true)) {
		if (element.type !== 'tspan' || element.ignore || element.invisible) continue;
		const bounds = element.getBoundingRect().clone();
		const transform = element.getComputedTransform();
		if (transform) bounds.applyTransform(transform);
		assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= chart.getWidth() + 1 && bounds.y + bounds.height <= chart.getHeight() + 1,
			`${JSON.stringify(element.style.text)} overflows ${chart.getWidth()}×${chart.getHeight()}: ${JSON.stringify(bounds)}`);
	}
}

test('phone radar names wrap completely in two lines and restore desktop and tiny-width formatting', () => {
	const categories = ['Accessibility', 'Documentation', 'Performance', 'Reliability', 'Usability', 'Visual design'];
	const wrapper = data(categories.flatMap((category, index) => [point(category, index + 2), point(category, index + 3, 1)]), categories);
	const option = buildRadarOption(wrapper, colors);
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 360 });
	try {
		chart.setOption({ ...option, animation: false }, { notMerge: true });
		for (const [width, height] of [[320, 300], [320, 360], [374, 300], [374, 360], [1200, 500], [240, 300], [374, 300], [1200, 500]]) {
			chart.resize({ width, height });
			assertTextFits(chart);
			const radar = chart.getOption().radar[0];
			const formatted = categories.map(category => radar.axisName.formatter(category));
			assert.deepEqual(radar.indicator.map(indicator => indicator.name), categories, 'line breaks must not change indicator identity');
			assert.deepEqual(chart.getOption().series.map(series => series.data[0].value), option.series.map(series => series.data[0].value));
			if (width >= 280 && width <= 519) {
				assert.equal(radar.axisName.fontSize, 11, 'wrapping must not make phone text smaller');
				assert.deepEqual(formatted.map(name => name.replace(/\s/g, '')), categories.map(name => name.replace(/\s/g, '')),
					'normal phone widths must display complete indicator names');
				assert.ok(formatted.every(name => name.split('\n').length <= 2));
				assert.ok(formatted.every(name => !name.includes('…')), 'short names must fit in one or two lines without truncation');
				assert.ok(['Visual design', 'Visual\ndesign'].includes(formatted.at(-1)), 'wrapping should preserve word boundaries');
				const visibleLines = chart.getZr().storage.getDisplayList(true)
					.filter(element => element.type === 'tspan' && !element.ignore && !element.invisible)
					.map(element => element.style.text);
				for (const line of formatted.flatMap(name => name.split('\n'))) {
					assert.ok(visibleLines.includes(line), `${JSON.stringify(line)} must be rendered at ${width}×${height}`);
				}
			} else {
				assert.ok(formatted.every(name => !name.includes('\n')), 'desktop and very narrow names must return to one line');
				assert.equal(radar.axisName.lineHeight, undefined, 'restoring the original layout must clear the wrap line height');
				assert.equal(radar.radius, width < 280 ? '42%' : '70%');
				if (width > 519) assert.deepEqual(formatted, categories, 'desktop names must be complete');
			}
		}
	} finally { chart.dispose(); }
});

for (const categoryCount of [3, 6, 12, 24]) {
	test(`real ECharts renders ${categoryCount}-spoke radar centered with readable labels across repeated narrow/wide resizes`, () => {
		const categories = Array.from({ length: categoryCount }, (_, index) => `Category ${index + 1} / A very long research department name`);
		const wrapper = data(categories.flatMap((category, index) => [point(category, index + 2), point(category, index + 3, 1)]), categories);
		const option = buildRadarOption(wrapper, colors);
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 320, height: 360 });
		try {
			chart.setOption({ ...option, animation: false }, { notMerge: true });
			for (const [width, height] of [[320, 360], [1200, 500], [240, 360], [1200, 500], [320, 360], [700, 400]]) {
				chart.resize({ width, height });
				const svg = chart.renderToSVGString();
				assert.match(svg, /^<svg\b/);
				assert.match(svg, /<path\b/);
				assert.doesNotMatch(svg, /NaN|Infinity/);
				assertTextFits(chart);
				const coord = chart.getModel().getComponent('radar').coordinateSystem;
				assert.equal(coord.cx, width / 2);
				assert.equal(coord.cy, height / 2);
				assert.equal(chart.getOption().radar[0].radius, width <= 279 ? '42%' : width <= 519 ? '52%' : '70%');
				assert.deepEqual(chart.getOption().series.map(series => series.data[0].value), option.series.map(series => series.data[0].value));
				assert.deepEqual(chart.getOption().series.flatMap(series => series.data[0]._raw.files).sort(), wrapper.data.flatMap(point => point.files).sort());
			}
		} finally { chart.dispose(); }
	});
}
