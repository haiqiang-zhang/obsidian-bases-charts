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
			export { Menu, StringValue, NumberValue, BooleanValue, DateValue, NullValue, ListValue } from 'obsidian';
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
			builder.onResolve({ filter: /^(\.\/layout|\.\.\/ui\/chartToolbar|\.\.\/ui\/chartFormulaEditor|\.\.\/ui\/groupColorsModal)$/ }, args => ({ path: args.path, namespace: 'test-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, args => ({
				contents: args.path === 'obsidian' ? `
					export class BasesView { constructor(controller) { Object.assign(this, controller); } }
					export class Events { changes = 0; trigger() { this.changes++; } }
					export class Menu {
						static created = []; items = [];
						constructor() { Menu.created.push(this); }
						setUseNativeMenu() { throw new Error('Group color menus must respect the native-menu preference'); }
						addItem(callback) {
							const item = { setTitle(value) { this.title = value; return this; }, setIcon(value) { this.icon = value; return this; },
								setChecked(value) { this.checked = value; return this; }, setDisabled(value) { this.disabled = value; return this; },
								onClick(callback) { this.click = callback; return this; } };
							callback(item); this.items.push(item); return this;
						}
						addSeparator() { return this; }
						onHide(callback) { this.onHideCallback = callback; return this; }
						hide() { this.onHideCallback?.(); }
						showAtPosition(position, doc) { this.position = position; this.doc = doc; }
					}
					class Value { constructor(data) { this.data = data; } toString() { return String(this.data); } }
					export class StringValue extends Value { static type = 'String'; }
					export class NumberValue extends Value { static type = 'Number'; }
					export class BooleanValue extends Value { static type = 'Boolean'; }
					export class DateValue extends Value { static type = 'Date'; }
					export class NullValue extends Value { static type = 'Null'; constructor() { super(null); } }
					export class ListValue extends Value { static type = 'List'; length() { return this.data.length; } get(index) { return this.data[index]; } }
				` : `export class ChartLayout {} export class ChartToolbar {} export class ChartFormulaEditor {}
					export class GroupColorCustomModal {
						constructor(host, key) { this.host = host; this.key = key; this.opened = false; }
						open() { this.opened = true; }
						close() { this.opened = false; }
					}`,
				loader: 'js',
			}));
		},
	}],
});
const { DataChartView, detectXAxisType, Menu, StringValue, NumberValue, BooleanValue, DateValue, NullValue, ListValue } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

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
			getSort: () => settings.get('sort') ?? [],
			getDisplayName: id => id,
		},
	}, { isConnected: true, doc: { body: { classList: { contains: () => false } } },
		win: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } });
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

test('daily grouping aggregates counts and sums within each visible group while preserving source files', () => {
	const dated = (path, date, amount) => entry(path, 'Tasks', amount, { 'note.completed at': new StringValue(date) });
	const early = dated('early.md', '2026-10-24T08:15:00', 2);
	const late = dated('late.md', '2026-10-24T23:50:00', 3);
	const next = dated('next.md', '2026-10-25T09:00:00', 7);
	const other = dated('other.md', '2026-10-24T13:00:00', 11);
	const hidden = dated('hidden.md', '2026-10-26T08:00:00', 100);
	const view = makeView([next, hidden, other, late, early], [
		group([late, early, next], new StringValue('Study')),
		group([other], new StringValue('Work')),
	], { x: 'note.completed at', y: ['file.name', 'note.amount'], 'aggregate:file.name': 'Count' });
	assert.equal(view.isDateXAxis(), true);
	assert.equal(view.getXDateGrouping(), 'exact', 'existing charts retain exact timestamps by default');
	view.setXDateGrouping('day');
	assert.deepEqual(view.config.get('x-date-grouping'), { property: 'note.completed at', unit: 'day' });
	const data = view.processData();
	assert.equal(data.xAxisType, 'category');
	assert.deepEqual(data.sortedXOrder, ['2026-10-24', '2026-10-25']);
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.groupIndex, point.y]), [
		['2026-10-24', 0, 2], ['2026-10-24', 1, 1], ['2026-10-25', 0, 1],
	]);
	assert.deepEqual(data.getFlat(1).map(point => [point.x, point.groupIndex, point.y]), [
		['2026-10-24', 0, 5], ['2026-10-24', 1, 11], ['2026-10-25', 0, 7],
	]);
	assert.deepEqual(data.getFlat(1)[0].files, ['late.md', 'early.md']);
	assert.deepEqual(data.getFlat(1)[0].fileValues, [3, 2]);
	assert.ok(!data.data.some(point => point.files.includes('hidden.md')));
});

test('multiple timestamps from one file contribute once per calendar bucket for Count and Average', () => {
	const first = entry('first.md', 'Tasks', 7, { 'note.completed': new ListValue([
		new StringValue('2026-10-24T08:00:00'), new DateValue('2026-10-24T14:00:00'),
		new StringValue('2026-10-25'), new StringValue('not a date'),
	]) });
	const second = entry('second.md', 'Tasks', 3, { 'note.completed': new StringValue('2026-10-24T23:59:00') });
	const view = makeView([first, second], undefined, {
		x: 'note.completed', y: ['file.name', 'note.amount'],
		'aggregate:file.name': 'Count', 'aggregate:note.amount': 'Average',
	});
	view.setXDateGrouping('day');
	const data = view.processData();
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [['2026-10-24', 2], ['2026-10-25', 1]]);
	assert.deepEqual(data.getFlat(1).map(point => [point.x, point.y]), [['2026-10-24', 5], ['2026-10-25', 7]]);
	assert.deepEqual(data.getFlat(1)[0].files, ['first.md', 'second.md']);
	assert.deepEqual(data.getFlat(1)[0].fileValues, [7, 3]);
});

test('date grouping is bound to its X property and rejects malformed or ineligible settings', () => {
	const record = entry('task.md', 'Tasks', 7, {
		'note.completed': new StringValue('2026-10-24T08:00:00'),
		'note.description': new StringValue('Complete report'),
	});
	const view = makeView([record], undefined, { x: 'note.completed' });
	view.setXDateGrouping('day');
	view.config.set('x', 'file.folder');
	assert.equal(view.getXDateGrouping(), 'exact');
	assert.deepEqual(view.processData().getFlat(0).map(point => point.x), ['Tasks']);
	view.config.set('x', 'note.completed');
	assert.equal(view.getXDateGrouping(), 'day', 'returning to the bound property restores its setting');
	for (const invalid of ['day', [], { unit: 'day' }, { property: 'note.completed', unit: 'century' }]) {
		view.config.set('x-date-grouping', invalid);
		assert.equal(view.getXDateGrouping(), 'exact');
	}
	view.config.set('x', 'note.description');
	view.setXDateGrouping('month');
	assert.equal(view.isDateXAxis(), false);
	assert.equal(view.getXDateGrouping(), 'exact');
	assert.deepEqual(view.processData().getFlat(0).map(point => point.x), ['Complete report']);
});

test('formula dates bucket chronologically and honor explicit descending X sort', () => {
	const dates = ['2026-03-24T12:00:00', '2026-01-03T08:00:00', '2026-02-01T13:00:00'];
	const entries = dates.map((date, i) => entry(`${i}.md`, 'Tasks', i + 1, { 'formula.Completed day': new DateValue(date) }));
	const view = makeView(entries, undefined, { x: 'formula.Completed day', sort: [{ property: 'file.name', direction: 'DESC' }] });
	assert.equal(view.isDateXAxis(), true, 'formula dates do not need note-property metadata');
	view.setXDateGrouping('month');
	assert.deepEqual(view.processData().sortedXOrder, ['2026-01', '2026-02', '2026-03']);
	view.config.set('sort', [{ property: 'formula.Completed day', direction: 'DESC' }]);
	const data = view.processData();
	assert.deepEqual(data.sortedXOrder, ['2026-03', '2026-02', '2026-01']);
	assert.deepEqual(data.getFlat(0).map(point => point.y), [1, 3, 2]);
	view.setXDateGrouping('exact');
	assert.deepEqual(view.processData().sortedXOrder, dates, 'exact mode retains native query order');
	assert.deepEqual(view.data.data, entries);
});

test('calendar grouping leaves Scatter None aggregation unchanged', () => {
	const entries = ['2026-10-24T08:00:00', '2026-10-24T09:00:00'].map((date, i) => entry(`${i}.md`, 'Tasks', i + 1, {
		'note.completed': new StringValue(date),
	}));
	const view = makeView(entries, undefined, { x: 'note.completed', 'aggregate:note.amount': 'None' });
	view.type = 'chart-scatter';
	view.setXDateGrouping('day');
	let data = view.processData();
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [['2026-10-24', 1], ['2026-10-24', 2]]);
	view.config.set('aggregate:note.amount', 'Count');
	data = view.processData();
	assert.deepEqual(data.getFlat(0).map(point => [point.x, point.y]), [['2026-10-24', 2]]);
	assert.deepEqual(data.getFlat(0)[0].files, ['0.md', '1.md']);
});

function datedGapView(extraConfig = {}, groups) {
	const entries = [
		entry('2026-08-31.md', '', 2, { 'formula.Date': new DateValue('2026-08-31'), 'note.score': new NullValue() }),
		entry('2026-09-03.md', '', null, { 'formula.Date': new DateValue('2026-09-03'), 'note.amount': new NullValue(), 'note.score': new NumberValue(7) }),
		entry('2026-09-06.md', '', 0, { 'formula.Date': new DateValue('2026-09-06'), 'note.score': new NumberValue(9) }),
	];
	return makeView(entries, groups?.(entries), { x: 'formula.Date', y: ['note.amount', 'note.score'], ...extraConfig });
}

test('date gaps preserve missing Y periods, original values, and daily-note date formulas', () => {
	const view = datedGapView();
	assert.equal(view.getShowMissingDates(), false);
	view.setXDateGrouping('day');
	const compact = view.processData();
	assert.equal(compact.dateTimeline, null);
	view.setShowMissingDates(true);
	assert.deepEqual(view.config.get('x-date-gaps'), { property: 'formula.Date', enabled: true });
	const data = view.processData();
	assert.deepEqual(data.dateTimeline.categories, ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
	assert.equal(data.dateTimeline.error, null);
	assert.deepEqual(data.data, compact.data, 'timeline expansion must not fabricate observations or change aggregates');
	assert.deepEqual(data.getFlat(0).map(p => [p.x, p.y, p.files, p.fileValues]), [
		['2026-08-31', 2, ['2026-08-31.md'], [2]], ['2026-09-06', 0, ['2026-09-06.md'], [0]],
	]);
	assert.deepEqual(data.getFlat(1).map(p => [p.x, p.y]), [['2026-09-03', 7], ['2026-09-06', 9]]);
	view.config.set('sort', [{ property: 'formula.Date', direction: 'DESC' }]);
	assert.deepEqual(view.processData().dateTimeline.categories, data.dateTimeline.categories.toReversed());
	view.setShowMissingDates(false);
	assert.equal(view.processData().dateTimeline, null);
});

test('date-gap settings are property-bound, validated, and inactive for exact time or non-Cartesian charts', () => {
	const view = datedGapView();
	view.setShowMissingDates(true);
	assert.equal(view.getXDateGrouping(), 'exact');
	assert.equal(view.processData().dateTimeline, null, 'enabling gaps must never silently regroup exact timestamps');
	view.setXDateGrouping('day');
	assert.ok(view.processData().dateTimeline);
	view.config.set('x', 'file.folder');
	assert.equal(view.supportsMissingDates(), false);
	assert.equal(view.getShowMissingDates(), false);
	view.config.set('x', 'formula.Date');
	assert.equal(view.getShowMissingDates(), true);
	for (const type of ['chart-pie', 'chart-radar', 'chart-ai']) {
		view.type = type;
		assert.equal(view.supportsMissingDates(), false);
		assert.equal(view.processData().dateTimeline, null);
	}
	for (const type of ['chart-bar', 'chart-line', 'chart-area', 'chart-scatter']) {
		view.type = type;
		assert.equal(view.supportsMissingDates(), true);
		assert.ok(view.processData().dateTimeline);
	}
	for (const invalid of [true, 'true', [], {}, { property: 'formula.Date', enabled: 'true' }, { property: 'note.other', enabled: true }]) {
		view.config.set('x-date-gaps', invalid);
		assert.equal(view.getShowMissingDates(), false);
		assert.equal(view.processData().dateTimeline, null);
	}
});

test('date range follows visible Base groups and includes dates with missing selected measures', () => {
	const view = datedGapView({}, entries => [group([entries[0], entries[1]], new StringValue('Visible'))]);
	view.setXDateGrouping('day');
	view.setShowMissingDates(true);
	assert.deepEqual(view.processData().dateTimeline.categories, ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
	view.config.set('y', ['note.amount']);
	const data = view.processData();
	assert.equal(data.dateTimeline.categories.at(-1), '2026-09-03', 'missing selected Y at the edge still reserves its calendar slot');
	assert.deepEqual(data.getFlat(0).flatMap(p => p.files), ['2026-08-31.md']);
});

test('file timestamps support gaps and oversized date ranges produce a recoverable chart message', () => {
	const view = makeView([
		entry('first.md', '', 2, { 'file.mtime': new NumberValue(new Date('2000-01-01T12:00:00').getTime()) }),
		entry('last.md', '', 3, { 'file.mtime': new NumberValue(new Date('2100-01-01T12:00:00').getTime()) }),
	], undefined, { x: 'file.mtime' });
	view.setXDateGrouping('day');
	view.setShowMissingDates(true);
	assert.match(view.getChartMessage(view.processData(), 0), /10,000 periods/);
	view.setXDateGrouping('year');
	const data = view.processData();
	assert.equal(data.dateTimeline.categories.length, 101);
	assert.equal(view.getChartMessage(data, 0), null);
	assert.equal(data.data.length, 2);
});

function colorFixture() {
	const a = entry('A/a.md', 'A', 1);
	const b = entry('B/b.md', 'B', 2);
	const groups = [group([a], new StringValue('Design')), group([b], new StringValue('Research'))];
	return { view: makeView([a, b], groups), groups };
}

test('group color overrides follow values through reordering, filtering, and restoring groups', () => {
	const { view, groups } = colorFixture();
	const [design, research] = view.getGroupColorEntries();
	view.setGroupColor(design.key, { type: 'custom', value: '#abc' });
	view.setGroupColor(research.key, { type: 'custom', value: '#123456' });
	view.data.groupedData = [groups[1], groups[0]];
	assert.deepEqual([...view.getResolvedGroupColors()], [[0, '#123456'], [1, '#AABBCC']]);
	view.data.groupedData = [groups[0]];
	assert.deepEqual([...view.getResolvedGroupColors()], [[0, '#AABBCC']]);
	view.setGroupColor(design.key, null);
	assert.equal(view.getGroupColorEntries()[0].choice, null);
	assert.equal(view.hasGroupColors(), true, 'a filtered-out group keeps its override');
	view.data.groupedData = [groups[1]];
	assert.equal(view.getGroupColorEntries()[0].color, '#123456');
	view.resetGroupColors();
	assert.equal(view.hasGroupColors(), false);
	assert.equal(view.getResolvedGroupColors().size, 0);
});

test('group colors are per-view and preserve explicit choices when palettes change', () => {
	const { view } = colorFixture();
	const second = colorFixture().view;
	const key = view.getGroupColorEntries()[0].key;
	view.setGroupColor(key, { type: 'custom', value: '#445566' });
	view.config.set('color-palette', 'green');
	assert.equal(view.getGroupColorEntries()[0].color, '#445566');
	assert.equal(second.hasGroupColors(), false);
	assert.equal(second.getGroupColorEntries()[0].choice, null);
});

test('group presets adapt to the owning theme while custom hex colors remain exact', () => {
	const { view } = colorFixture();
	const [first, second] = view.getGroupColorEntries();
	view.setGroupColor(first.key, { type: 'preset', value: 'blue' });
	view.setGroupColor(second.key, { type: 'custom', value: '#a1b2c3' });
	const light = view.getGroupColorEntries();
	view.containerEl.doc.body.classList.contains = name => name === 'theme-dark';
	const dark = view.getGroupColorEntries();
	assert.notEqual(light[0].color, dark[0].color);
	assert.equal(light[1].color, '#A1B2C3');
	assert.equal(dark[1].color, light[1].color);
});

test('group color keys distinguish typed equal labels and missing values from text', () => {
	const values = [new NumberValue(1), new StringValue('1'), new NullValue(), new StringValue('null')];
	const entries = values.map((_, i) => entry(`${i}.md`, 'A', i + 1));
	const view = makeView(entries, values.map((value, i) => group([entries[i]], value)));
	const groups = view.getGroupColorEntries();
	assert.equal(new Set(groups.map(item => item.key)).size, 4);
	groups.forEach((item, index) => view.setGroupColor(item.key, { type: 'custom', value: `#${index + 1}11222` }));
	view.data.groupedData.reverse();
	assert.deepEqual(view.getGroupColorEntries().map(item => item.color), ['#411222', '#311222', '#211222', '#111222']);
});

test('one real group retains its legend and editor while ungrouped data has no group controls', () => {
	const { view, groups } = colorFixture();
	view.data.groupedData = [groups[0]];
	assert.equal(view.processData().isGrouped, true);
	assert.equal(view.getGroupColorEntries().length, 1);
	assert.deepEqual(view.getChartLegend(view.processData()), [{ name: 'Design', colorIndex: 0, groupIndex: 0 }]);
	view.data.groupedData = [group(groups[0].entries)];
	assert.equal(view.processData().isGrouped, false);
	assert.deepEqual(view.getGroupColorEntries(), []);
	assert.deepEqual(view.getChartLegend(view.processData()), []);
});

test('invalid or hidden group changes cannot write view config', () => {
	const { view } = colorFixture();
	view.setGroupColor('["String","Hidden"]', { type: 'custom', value: '#123456' });
	view.setGroupColor(view.getGroupColorEntries()[0].key, { type: 'custom', value: 'red' });
	view.setGroupColor(view.getGroupColorEntries()[0].key, { type: 'preset', value: 'unknown' });
	assert.equal(view.config.get('group-colors'), undefined);
	assert.equal(view.events.changes, 0);
});

function menuFixture() {
	const fixture = colorFixture();
	const writes = [];
	const set = fixture.view.config.set;
	fixture.view.config.set = (key, value) => { writes.push([key, value]); set(key, value); };
	const attributes = new Map();
	const anchor = {
		ownerDocument: { name: 'popout document' },
		setAttribute: (name, value) => attributes.set(name, value),
		getBoundingClientRect: () => ({ left: 125, bottom: 280 }),
	};
	return { ...fixture, writes, anchor, attributes };
}

test('legend menu respects native preference, anchors in its owning document, and opens without saving', () => {
	const { view, writes, anchor, attributes } = menuFixture();
	view.openGroupColors(view.getGroupColorEntries()[0].key, anchor);
	const menu = Menu.created.at(-1);
	assert.equal(menu.doc, anchor.ownerDocument);
	assert.deepEqual(menu.position, { x: 125, y: 284 });
	assert.equal(menu.items[0].title, 'Design');
	assert.equal(menu.items[0].disabled, true);
	assert.deepEqual(menu.items.filter(item => item.checked).map(item => item.title), ['Automatic']);
	assert.equal(menu.items.some(item => item.title === 'Reset all group colors'), false);
	assert.deepEqual(writes, []);
	assert.equal(attributes.get('aria-expanded'), 'true');
	menu.hide();
	assert.equal(attributes.get('aria-expanded'), 'false');
});

test('preset menu action targets the stable group value after reordering and checks the saved choice', () => {
	const { view, groups, writes, anchor } = menuFixture();
	const key = view.getGroupColorEntries()[0].key;
	view.openGroupColors(key, anchor);
	const menu = Menu.created.at(-1);
	view.data.groupedData = [groups[1], groups[0]];
	menu.items.find(item => item.title === 'Blue').click();
	assert.deepEqual(writes, [['group-colors', { version: 1, overrides: { [key]: { type: 'preset', value: 'blue' } } }]]);
	assert.equal(view.getGroupColorEntries()[0].choice, null);
	view.openGroupColors(key, anchor);
	assert.deepEqual(Menu.created.at(-1).items.filter(item => item.checked).map(item => item.title), ['Blue']);
});

test('Automatic clears one group and Reset all group colors also clears hidden choices', () => {
	const { view, groups, writes, anchor } = menuFixture();
	const [design, research] = view.getGroupColorEntries();
	view.setGroupColor(design.key, { type: 'preset', value: 'blue' });
	view.setGroupColor(research.key, { type: 'custom', value: '#123456' });
	view.data.groupedData = [groups[0]];
	writes.length = 0;
	view.openGroupColors(design.key, anchor);
	Menu.created.at(-1).items.find(item => item.title === 'Automatic').click();
	assert.deepEqual(writes[0], ['group-colors', { version: 1, overrides: { [research.key]: { type: 'custom', value: '#123456' } } }]);
	view.openGroupColors(design.key, anchor);
	Menu.created.at(-1).items.find(item => item.title === 'Reset all group colors').click();
	assert.deepEqual(writes[1], ['group-colors', null]);
	assert.equal(view.hasGroupColors(), false);
});

test('Custom color opens the selected group editor without changing its saved color', () => {
	const { view, writes, anchor, attributes } = menuFixture();
	const key = view.getGroupColorEntries()[1].key;
	view.setGroupColor(key, { type: 'custom', value: '#123456' });
	writes.length = 0;
	view.openGroupColors(key, anchor);
	const menu = Menu.created.at(-1);
	assert.deepEqual(menu.items.filter(item => item.checked).map(item => item.title), ['Custom color…']);
	menu.items.find(item => item.title === 'Custom color…').click();
	assert.equal(view.groupColorsModal.host, view);
	assert.equal(view.groupColorsModal.key, key);
	assert.equal(view.groupColorsModal.opened, true);
	assert.equal(attributes.get('aria-expanded'), 'false');
	assert.deepEqual(writes, []);
});

test('unknown groups and stale menu actions cannot save colors or open an editor', () => {
	const { view, groups, writes, anchor } = menuFixture();
	const menuCount = Menu.created.length;
	view.openGroupColors('["String","Unknown"]', anchor);
	assert.equal(Menu.created.length, menuCount);
	const key = view.getGroupColorEntries()[0].key;
	view.openGroupColors(key, anchor);
	const menu = Menu.created.at(-1);
	view.data.groupedData = [groups[1]];
	menu.items.find(item => item.title === 'Blue').click();
	menu.items.find(item => item.title === 'Automatic').click();
	menu.items.find(item => item.title === 'Custom color…').click();
	view.openGroupColors(key, anchor);
	assert.equal(Menu.created.length, menuCount + 1);
	assert.equal(view.groupColorsModal, null);
	assert.deepEqual(writes, []);
});
