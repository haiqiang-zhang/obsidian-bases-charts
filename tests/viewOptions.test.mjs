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
			export { lineChartRegistration } from './src/dataCharts/charts/lineChart.ts';
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
			builder.onResolve({ filter: /^(obsidian|\.\/layout|\.\.\/ui\/chartToolbar)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian'
					? 'export class BasesView {} export class Events {} export class NullValue {} export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
					: 'export class ChartLayout {} export class ChartToolbar {}',
			}));
		},
	}],
});
const { pieChartRegistration, scatterChartRegistration, ScatterChartView, barChartRegistration, lineChartRegistration } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=chart-view-options-under-test.mjs`).toString('base64')}`);

function optionKeys(options) {
	return options.flatMap(option => option.type === 'group' ? optionKeys(option.items) : [option.key]);
}

const scaleKeys = ['sync-y-axes', 'min-y-override', 'max-y-override'];

test('pie offers its appearance controls without an unused Y-scale group', () => {
	const options = pieChartRegistration.viewOptions();
	assert.deepEqual(optionKeys(options), ['show-labels', 'show-percentages', 'ignore-null']);
	assert.ok(options.every(option => option.type !== 'group'));
});

test('scatter hides the unused label property while keeping every valid Y-scale control', () => {
	const options = scatterChartRegistration.viewOptions();
	assert.deepEqual(optionKeys(options), scaleKeys);
	assert.equal(options[0].displayName, 'Y scale');
	const queried = [];
	const labelProperty = ScatterChartView.prototype.getLabelProperty.call({
		config: { getAsPropertyId: key => { queried.push(key); return 'note.legacy-label'; } },
	});
	assert.equal(labelProperty, 'note.legacy-label', 'saved label metadata remains readable');
	assert.deepEqual(queried, ['label-property']);
});

test('bar and line keep their appearance controls and valid Y-scale settings', () => {
	assert.deepEqual(optionKeys(barChartRegistration.viewOptions()), ['show-labels', 'show-percentages', ...scaleKeys]);
	assert.deepEqual(optionKeys(lineChartRegistration.viewOptions()), ['null-handling', ...scaleKeys]);
});
