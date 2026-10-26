import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Keep the real shared and per-chart view options, stubbing only host lifecycle.
const result = await build({
	stdin: {
		contents: `
			export { pieChartRegistration } from './src/dataCharts/charts/pieChart.ts';
			export { scatterChartRegistration, ScatterChartView } from './src/dataCharts/charts/scatterChart.ts';
			export { barChartRegistration } from './src/dataCharts/charts/barChart.ts';
			export { areaChartRegistration } from './src/dataCharts/charts/areaChart.ts';
			export { radarChartRegistration } from './src/dataCharts/charts/radarChart.ts';
			export { lineChartRegistration } from './src/dataCharts/charts/lineChart.ts';
			export { CHART_PALETTES, DEFAULT_CHART_PALETTE } from './src/ui/chartPalettes.ts';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'view-lifecycle-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\/layout|\.\.\/ui\/chartToolbar|\.\.\/ui\/chartFormulaEditor)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian'
					? 'export class BasesView {} export class Events {} export class NullValue {} export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
					: 'export class ChartLayout {} export class ChartToolbar {} export class ChartFormulaEditor {}',
			}));
		},
	}],
});
const { pieChartRegistration, scatterChartRegistration, ScatterChartView, barChartRegistration, lineChartRegistration, areaChartRegistration, radarChartRegistration, CHART_PALETTES, DEFAULT_CHART_PALETTE } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=chart-view-options-under-test.mjs`).toString('base64')}`);

function optionKeys(options) {
	return options.flatMap(option => option.type === 'group' ? optionKeys(option.items) : [option.key]);
}

const scaleKeys = ['sync-y-axes', 'min-y-override', 'max-y-override'];

test('pie offers its appearance controls without an unused Y-scale group', () => {
	const options = pieChartRegistration.viewOptions();
	assert.deepEqual(optionKeys(options), ['color-palette', 'show-labels', 'show-percentages', 'ignore-null']);
	assert.ok(options.every(option => option.type !== 'group'));
});

test('scatter hides the unused label property while keeping every valid Y-scale control', () => {
	const options = scatterChartRegistration.viewOptions();
	assert.deepEqual(optionKeys(options), ['color-palette', ...scaleKeys]);
	assert.equal(options.find(option => option.type === 'group').displayName, 'Y scale');
	const queried = [];
	const labelProperty = ScatterChartView.prototype.getLabelProperty.call({
		config: { getAsPropertyId: key => { queried.push(key); return 'note.legacy-label'; } },
	});
	assert.equal(labelProperty, 'note.legacy-label', 'saved label metadata remains readable');
	assert.deepEqual(queried, ['label-property']);
});

test('bar and line keep their appearance controls and valid Y-scale settings', () => {
	assert.deepEqual(optionKeys(barChartRegistration.viewOptions()), ['color-palette', 'bar-layout', 'show-labels', 'show-percentages', ...scaleKeys]);
	assert.deepEqual(optionKeys(lineChartRegistration.viewOptions()), ['color-palette', 'null-handling', ...scaleKeys]);
});

test('only bar views expose stacking; 100% hides incompatible formatting and scale controls via native API', () => {
	let layout = 'grouped';
	const options = barChartRegistration.viewOptions({ get: () => layout });
	const picker = options.find(o => o.key === 'bar-layout');
	assert.equal(picker.type, 'dropdown'); assert.equal(picker.default, 'grouped');
	assert.deepEqual(picker.options, { grouped: 'Grouped', stacked: 'Stacked', percent: '100% Stacked' });
	const format = options.find(o => o.key === 'show-percentages'), scale = options.find(o => o.type === 'group');
	for (layout of ['grouped', 'stacked', 'percent', 'unknown']) {
		assert.equal(format.shouldHide(), layout === 'percent');
		assert.equal(scale.shouldHide(), layout === 'percent');
	}
	for (const r of [lineChartRegistration, scatterChartRegistration, areaChartRegistration, pieChartRegistration, radarChartRegistration]) {
		assert.ok(!optionKeys(r.viewOptions()).includes('bar-layout'));
	}
});

test('all six chart registrations expose the same native per-view palette dropdown', () => {
	const registrations = [barChartRegistration, lineChartRegistration, scatterChartRegistration, pieChartRegistration, areaChartRegistration, radarChartRegistration];
	const expectedOptions = Object.fromEntries(CHART_PALETTES.map(palette => [palette.id, palette.name]));
	for (const registration of registrations) {
		const options = registration.viewOptions();
		const paletteOptions = options.filter(option => option.key === 'color-palette');
		assert.equal(paletteOptions.length, 1, registration.name);
		assert.deepEqual(paletteOptions[0], {
			displayName: 'Color palette', type: 'dropdown', key: 'color-palette',
			default: DEFAULT_CHART_PALETTE, options: expectedOptions,
		});
		assert.ok(paletteOptions[0].default in paletteOptions[0].options, 'the default must be selectable');
	}
});


test('area supports stacked Y scales and radar exposes only applicable radial controls', () => {
    assert.ok(scaleKeys.every(key => optionKeys(areaChartRegistration.viewOptions()).includes(key)));
    assert.deepEqual(optionKeys(radarChartRegistration.viewOptions()), ['color-palette', 'radar-scale', 'show-fill']);
});
