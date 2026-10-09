import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Run the real parsing, grouping, aggregation, and DataWrapper code. Only the
// Obsidian runtime and DOM rendering boundaries are replaced for Node.
const result = await build({
	stdin: {
		contents: `
			export { DataChartView } from './src/dataCharts/dataChartView.ts';
			export { detectXAxisType } from './src/utils/utils.ts';
			export { StringValue, NumberValue, BooleanValue, DateValue, NullValue } from 'obsidian';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'test-runtime-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test-stub' }));
			builder.onResolve({ filter: /^(\.\/layout|\.\.\/ui\/chartToolbar)$/ }, args => ({ path: args.path, namespace: 'test-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, args => ({
				contents: args.path === 'obsidian' ? `
					export class BasesView { constructor(controller) { Object.assign(this, controller); } }
					export class Events {}
					class Value { constructor(data) { this.data = data; } toString() { return String(this.data); } }
					export class StringValue extends Value {}
					export class NumberValue extends Value {}
					export class BooleanValue extends Value {}
					export class DateValue extends Value {}
					export class NullValue extends Value { constructor() { super(null); } }
					export class ListValue extends Value { length() { return this.data.length; } get(index) { return this.data[index]; } }
				` : 'export class ChartLayout {} export class ChartToolbar {}',
				loader: 'js',
			}));
		},
	}],
});
const { DataChartView, detectXAxisType, StringValue, NumberValue, BooleanValue, DateValue, NullValue } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function entry(path, folder, amount, extraValues = {}) {
	const values = {
		'file.folder': new StringValue(folder),
		'file.name': new StringValue(path),
		'note.amount': new NumberValue(amount),
		...extraValues,
	};
	return { file: { path }, getValue: id => values[id] ?? null };
}

function group(entries, key) {
	return { entries, key, hasKey: () => key !== undefined && !(key instanceof NullValue) };
}

function makeView(entries, groups = [group(entries)], extraConfig = {}) {
	const { order: legacyOrder = ['note.amount'], ...pluginConfig } = extraConfig;
	const settings = new Map(Object.entries({ x: 'file.folder', ...pluginConfig }));
	const view = new DataChartView({
		app: {},
		data: { data: entries, groupedData: groups },
		config: {
			get: key => settings.get(key),
			set: (key, value) => {
				assert.notEqual(key, 'order', 'native order is not writable through plugin config.set');
				settings.set(key, value);
			},
			getAsPropertyId: key => settings.get(key) ?? null,
			getOrder: () => legacyOrder,
			getDisplayName: id => id,
		},
	}, {});
	view.type = 'chart-bar';
	return view;
}

test('file.folder X categories aggregate files in the same folder', () => {
	const view = makeView([
		entry('Study/one.md', 'Study', 2),
		entry('Study/two.md', 'Study', 3),
		entry('Work/three.md', 'Work', 7),
	]);
	const data = view.processData();

	assert.equal(data.xAxisType, 'category');
	assert.deepEqual(data.sortedXOrder, ['Study', 'Work']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [['Study', 5], ['Work', 7]]);
	assert.deepEqual(data.getFlat(0)[0].files, ['Study/one.md', 'Study/two.md']);
});

test('selected groups filter plotted entries while native Sort controls X order', () => {
	const a = entry('A/a.md', 'A', 1);
	const b = entry('B/b.md', 'B', 2);
	const c = entry('C/c.md', 'C', 3);
	const view = makeView([a, b, c], [group([c], new StringValue('C')), group([a], new StringValue('A'))]);
	const data = view.processData();

	assert.deepEqual(data.sortedXOrder, ['A', 'C']);
	assert.deepEqual(data.getGroupIdentifiers(), ['C', 'A']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y, point.groupIndex]), [['A', 1, 1], ['C', 3, 0]]);
	assert.deepEqual(data.getFlat(0).flatMap(point => point.files), ['A/a.md', 'C/c.md']);
});

test('interleaved groups preserve global Sort and omit hidden categories', () => {
	const hidden = entry('Hidden/hidden.md', 'Hidden', 99);
	const a = entry('A/red.md', 'A', 1);
	const b = entry('B/blue.md', 'B', 2);
	const c = entry('C/red.md', 'C', 3);
	const d = entry('D/blue.md', 'D', 4);
	const view = makeView([hidden, a, b, c, d], [
		group([b, d], new StringValue('Blue')),
		group([a, c], new StringValue('Red')),
	]);
	const data = view.processData();
	assert.deepEqual(data.getGroupIdentifiers(), ['Blue', 'Red']);
	assert.deepEqual(data.sortedXOrder, ['A', 'B', 'C', 'D']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.groupIndex]), [['A', 1], ['B', 0], ['C', 1], ['D', 0]]);
	assert.deepEqual(data.getFlat(0).flatMap(point => point.files), ['A/red.md', 'B/blue.md', 'C/red.md', 'D/blue.md']);
});

test('groups with the same display text never sum into the same bucket', () => {
	const numeric = entry('Shared/numeric.md', 'Shared', 2);
	const text = entry('Shared/text.md', 'Shared', 5);
	const view = makeView([numeric, text], [group([numeric], new NumberValue(1)), group([text], new StringValue('1'))]);
	const data = view.processData();

	assert.deepEqual(data.getFlat(0).map(point => [point.y, point.groupIndex]), [[2, 0], [5, 1]]);
	assert.deepEqual(data.getGroupIdentifiers(), ['1', '1 (2)']);
});

test('missing group values remain separate from literal null text', () => {
	const missing = entry('Shared/missing.md', 'Shared', 2);
	const text = entry('Shared/text.md', 'Shared', 5);
	const view = makeView([missing, text], [group([missing], new NullValue()), group([text], new StringValue('null'))]);
	const data = view.processData();

	assert.deepEqual(data.getFlat(0).map(point => [point.y, point.groupIndex]), [[2, 0], [5, 1]]);
	assert.deepEqual(data.getGroupIdentifiers(), ['(No value)', 'null']);
});

test('legacy Y order is preserved until custom y takes over reordering and removal', () => {
	const view = makeView([entry('Study/one.md', 'Study', 2), entry('Study/two.md', 'Study', 3)], undefined, {
		order: ['file.name', 'note.amount'],
		'aggregate:file.name': 'Count',
	});
	let data = view.processData();
	assert.deepEqual(data.getChartIdentifiers(), ['file.name', 'note.amount']);
	assert.equal(data.getFlat(0)[0].y, 2);
	assert.equal(data.getFlat(1)[0].y, 5);

	view.config.set('y', ['note.amount', 'file.name']);
	data = view.processData();
	assert.deepEqual(data.getChartIdentifiers(), ['note.amount', 'file.name']);
	assert.deepEqual(view.config.getOrder(), ['file.name', 'note.amount']);
	assert.equal(data.getFlat(0)[0].y, 5);
	assert.equal(data.getFlat(1)[0].y, 2);

	view.config.set('y', ['note.amount']);
	assert.deepEqual(view.processData().getChartIdentifiers(), ['note.amount']);
	view.config.set('y', []);
	assert.deepEqual(view.processData().getChartIdentifiers(), []);
	assert.deepEqual(view.processData().data, []);
});

test('custom Y properties filter invalid IDs and duplicates without falling back from an empty array', () => {
	const view = makeView([], undefined, {
		y: ['note.amount', null, 4, 'invalid', 'file.', 'formula.total', 'note.amount'],
	});
	assert.deepEqual(view.getYProperties(), ['note.amount', 'formula.total']);
	view.config.set('y', ['invalid']);
	assert.deepEqual(view.getYProperties(), []);
	view.config.set('y', 'invalid config');
	assert.deepEqual(view.getYProperties(), ['note.amount']);
});

test('replacing query results rebuilds groups without stale categories', () => {
	const a = entry('A/a.md', 'A', 1);
	const b = entry('B/b.md', 'B', 2);
	const view = makeView([a, b], [group([a], new StringValue('A'))]);
	assert.deepEqual(view.processData().sortedXOrder, ['A']);
	view.data = { data: [a, b], groupedData: [group([b], new StringValue('B'))] };
	const data = view.processData();
	assert.deepEqual(data.sortedXOrder, ['B']);
	assert.deepEqual(data.getGroupIdentifiers(), ['B']);
	assert.deepEqual(data.getFlat(0).flatMap(point => point.files), ['B/b.md']);
});

test('folder and file-name prefixes are categories rather than numeric Y values', () => {
	const view = makeView([entry('2026/study/123 notes.md', '2026/study', 2)], undefined, {
		order: ['file.folder', 'file.name'],
	});
	assert.deepEqual(view.processData().data, []);

	view.config.set('aggregate:file.folder', 'Count');
	view.config.set('aggregate:file.name', 'Count');
	const data = view.processData();
	assert.deepEqual(data.sortedXOrder, ['2026/study']);
	assert.deepEqual(data.data.map(point => [point.chartIndex, point.y]), [[0, 1], [1, 1]]);
});

test('numeric Y accepts finite numbers and full numeric strings, not blank or partial values', () => {
	const values = [
		new NumberValue(0), new NumberValue(2), new StringValue(' 3.5 '),
		new StringValue('123 notes'), new StringValue(''), new StringValue('   '),
		new NumberValue(Infinity), new NumberValue(NaN), new StringValue('Infinity'),
		new BooleanValue(false),
	];
	const entries = values.map((value, index) => entry(`Study/${index}.md`, 'Study', 0, { 'note.amount': value }));
	const data = makeView(entries).processData();
	assert.equal(data.getFlat(0)[0].y, 5.5);
	assert.deepEqual(data.getFlat(0)[0].files, ['Study/0.md', 'Study/1.md', 'Study/2.md']);
});

test('Count omits null and NullValue while preserving zero and false', () => {
	const values = [null, new NullValue(), new NumberValue(0), new BooleanValue(false), new StringValue('text')];
	const entries = values.map((value, index) => entry(`Study/${index}.md`, 'Study', 0, { 'note.amount': value }));
	const data = makeView(entries, undefined, { 'aggregate:note.amount': 'Count' }).processData();

	assert.equal(data.getFlat(0)[0].y, 3);
	assert.deepEqual(data.getFlat(0)[0].files, ['Study/2.md', 'Study/3.md', 'Study/4.md']);
});

test('built-in file X properties use their documented value types', () => {
	const app = { metadataTypeManager: { properties: { 'file.folder': { widget: 'number' } } } };
	assert.equal(detectXAxisType(app, 'file.size'), 'value');
	assert.equal(detectXAxisType(app, 'file.ctime'), 'time');
	assert.equal(detectXAxisType(app, 'file.mtime'), 'time');
	assert.equal(detectXAxisType(app, 'file.folder'), 'category');
});

test('Count retains vault-root files as slash without converting missing folders to root', () => {
	const entries = [
		entry('root-one.md', '', 0),
		entry('root-two.md', '', 0),
		entry('missing.md', '', 0, { 'file.folder': null }),
		entry('null-value.md', '', 0, { 'file.folder': new NullValue() }),
		entry('Study/note.md', 'Study', 0),
	];
	const data = makeView(entries, undefined, { y: ['file.name'], 'aggregate:file.name': 'Count' }).processData();
	assert.deepEqual(data.sortedXOrder, ['/', 'Study']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [['/', 2], ['Study', 1]]);
	assert.deepEqual(data.getFlat(0)[0].files, ['root-one.md', 'root-two.md']);
});

test('same-day timestamps remain distinct and only identical timestamps aggregate', () => {
	const early = '2026-10-09T08:00:00.000Z';
	const late = '2026-10-09T09:00:00.000Z';
	const entries = [
		entry('late.md', '', 2, { 'file.ctime': new StringValue(late) }),
		entry('early.md', '', 1, { 'file.ctime': new StringValue(early) }),
		entry('early-second.md', '', 3, { 'file.ctime': new StringValue(early) }),
	];
	const data = makeView(entries, undefined, { x: 'file.ctime' }).processData();
	assert.deepEqual(data.sortedXOrder, [late, early]);
	assert.deepEqual(data.getFlat(0).map(point => [point.x.toISOString(), point.y]), [[late, 2], [early, 4]]);
	assert.deepEqual(data.getFlat(0)[1].files, ['early.md', 'early-second.md']);
});

test('nearby numeric X values are never merged by compact number rounding', () => {
	const entries = [
		entry('first.md', '', 1, { 'file.size': new NumberValue(12345) }),
		entry('second.md', '', 2, { 'file.size': new NumberValue(12346) }),
		entry('first-again.md', '', 3, { 'file.size': new NumberValue(12345) }),
	];
	const data = makeView(entries, undefined, { x: 'file.size' }).processData();
	assert.deepEqual(data.sortedXOrder, ['12345', '12346']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [[12345, 4], [12346, 2]]);
	assert.deepEqual(data.getFlat(0)[0].files, ['first.md', 'first-again.md']);
});

test('invalid and out-of-range timestamps are skipped before generating X identities', () => {
	const valid = '2026-10-09T08:00:00.000Z';
	const values = [
		new DateValue('invalid date'), new NumberValue(Infinity), new NumberValue(8.64e15 + 1),
		new NumberValue(new Date(valid).getTime()),
	];
	const entries = values.map((value, index) => entry(`${index}.md`, '', 1, { 'file.ctime': value }));
	const data = makeView(entries, undefined, { x: 'file.ctime' }).processData();
	assert.deepEqual(data.sortedXOrder, [valid]);
	assert.deepEqual(data.getFlat(0).flatMap(point => point.files), ['3.md']);
});
