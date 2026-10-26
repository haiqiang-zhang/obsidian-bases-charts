import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
			export * from './src/dataCharts/dateBuckets.ts';
			export { DateValue, StringValue, NumberValue, ListValue, NullValue } from 'obsidian';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'date-value-runtime',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
				class Value { constructor(data) { this.data = data; } toString() { return String(this.data); } }
				export class DateValue extends Value {}
				export class StringValue extends Value {}
				export class NumberValue extends Value {}
				export class NullValue extends Value { constructor() { super(null); } }
				export class ListValue extends Value { length() { return this.data.length; } get(i) { return this.data[i]; } }
			` }));
		},
	}],
});
const { normalizeDateGrouping, isDateProperty, bucketDateValues, buildDateTimeline, MAX_DATE_PERIODS, DateValue, StringValue, NumberValue, ListValue, NullValue } = await import(
	`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`,
);

function inTimezone(timezone, callback) {
	const previous = process.env.TZ;
	process.env.TZ = timezone;
	try { callback(); } finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
}

test('unknown grouping settings preserve exact-time behavior', () => {
	for (const value of [undefined, null, false, {}, 'unsupported', '__proto__', 'toString']) {
		assert.equal(normalizeDateGrouping(value), 'exact');
	}
	for (const value of ['exact', 'day', 'week', 'month', 'year']) assert.equal(normalizeDateGrouping(value), value);
});

test('calendar eligibility recognizes date metadata, date formulas and ISO text without guessing arbitrary values', () => {
	const app = { metadataTypeManager: { properties: { 'completed at': { widget: 'datetime' }, due: { widget: 'date' } } } };
	assert.equal(isDateProperty(app, 'note.Completed At'), true);
	assert.equal(isDateProperty(app, 'note.due'), true);
	assert.equal(isDateProperty({}, 'file.ctime'), true);
	assert.equal(isDateProperty({}, 'file.mtime'), true);
	assert.equal(isDateProperty({}, 'formula.day', [new DateValue('2026-10-25')]), true);
	assert.equal(isDateProperty({}, 'note.completed at', [null, new StringValue('2026-10-25T18:43:20+08:00')]), true);
	assert.equal(isDateProperty({}, 'note.history', [new ListValue([new NullValue(), new StringValue('2026-10-25')])]), true);
	assert.equal(isDateProperty({}, 'note.amount', [new NumberValue(1760000000000), new StringValue('2026'), new StringValue('03/04/2026')]), false);
	assert.equal(isDateProperty(app, 'formula.due', []), false, 'note metadata must not leak to a same-named formula');
	assert.equal(isDateProperty({}, 'note.completed at', [new StringValue('2026-02-30')]), false);
});

test('date-only and floating local datetimes preserve the calendar day in every timezone', () => {
	for (const timezone of ['America/Los_Angeles', 'Asia/Shanghai', 'Pacific/Auckland']) inTimezone(timezone, () => {
		assert.deepEqual(bucketDateValues(new DateValue('2026-10-25'), 'day'), ['2026-10-25']);
		assert.deepEqual(bucketDateValues(new StringValue('2026-10-25T00:05:00'), 'day'), ['2026-10-25']);
		assert.deepEqual(bucketDateValues(new StringValue('2024-02-29'), 'month'), ['2024-02']);
		assert.deepEqual(bucketDateValues(new StringValue('0099-01-01'), 'year'), ['0099']);
	});
});

test('offset datetimes use the local calendar instead of slicing their written or UTC date', () => {
	inTimezone('America/Los_Angeles', () => {
		assert.deepEqual(bucketDateValues(new StringValue('2026-10-25T01:00:00Z'), 'day'), ['2026-10-24']);
		assert.deepEqual(bucketDateValues(new DateValue('2026-10-25T01:00:00+08:00'), 'day'), ['2026-10-24']);
		assert.deepEqual(bucketDateValues(new StringValue('2026-10-25T01:00+0800'), 'day'), ['2026-10-24']);
		assert.deepEqual(bucketDateValues(new StringValue('2026-10-25T01:00+08'), 'day'), ['2026-10-24']);
	});
	inTimezone('Asia/Shanghai', () => {
		assert.deepEqual(bucketDateValues(new StringValue('2026-12-31T18:00:00.999999Z'), 'day'), ['2027-01-01']);
		assert.deepEqual(bucketDateValues(new StringValue('2026-12-31T18:00:00Z'), 'year'), ['2027']);
	});
});

test('weeks start Monday across year and daylight-saving boundaries', () => {
	inTimezone('America/New_York', () => {
		assert.deepEqual(bucketDateValues(new StringValue('2027-01-01'), 'week'), ['2026-12-28']);
		assert.deepEqual(bucketDateValues(new StringValue('2027-01-04'), 'week'), ['2027-01-04']);
		const spring = new ListValue([
			new StringValue('2026-03-08T06:30:00Z'), new StringValue('2026-03-08T07:30:00Z'),
			new StringValue('2026-03-09T04:00:00Z'),
		]);
		assert.deepEqual(bucketDateValues(spring, 'day'), ['2026-03-08', '2026-03-09']);
		assert.deepEqual(bucketDateValues(spring, 'week'), ['2026-03-02', '2026-03-09']);
		const fall = new ListValue([new StringValue('2026-11-01T01:30:00-04:00'), new StringValue('2026-11-01T01:30:00-05:00')]);
		assert.deepEqual(bucketDateValues(fall, 'day'), ['2026-11-01']);
		assert.deepEqual(bucketDateValues(fall, 'week'), ['2026-10-26']);
	});
});

test('each entry contributes at most once per bucket, preserving real separate buckets and ignoring missing dates', () => {
	const values = new ListValue([
		new StringValue('2026-10-25T01:00:00'), new StringValue('2026-10-25T23:59:59'),
		new StringValue('invalid'), new NullValue(), new StringValue('2026-10-26T12:00:00'),
	]);
	assert.deepEqual(bucketDateValues(values, 'day'), ['2026-10-25', '2026-10-26']);
	assert.deepEqual(bucketDateValues(values, 'month'), ['2026-10']);
	assert.deepEqual(bucketDateValues(values, 'year'), ['2026']);
	assert.equal(bucketDateValues(new ListValue([null, new NullValue()]), 'day'), null);
});

test('malformed dates never silently roll into valid days and numeric millis require an explicit file timestamp', () => {
	const invalid = ['', '2025-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-01-00', '2026-1-1',
		'2026-01-01T24:00', '2026-01-01T23:60', '2026-01-01T23:59:60', '2026-01-01T12:00+24:00',
		'2026-01-01T12:00+08:99', '2026-01-01garbage', 'January 1, 2026', '2026', '42'];
	for (const value of invalid) assert.equal(bucketDateValues(new StringValue(value), 'day'), null, value);
	assert.deepEqual(bucketDateValues(new StringValue('2000-02-29'), 'day'), ['2000-02-29']);
	assert.equal(bucketDateValues(null, 'day'), null);
	assert.equal(bucketDateValues(new NumberValue(0), 'day', 'note.amount'), null);
	assert.equal(bucketDateValues(new NumberValue(Infinity), 'day', 'file.ctime'), null);
	inTimezone('UTC', () => assert.deepEqual(bucketDateValues(new NumberValue(0), 'day', 'file.ctime'), ['1970-01-01']));
});

test('calendar timeline retains missing dates across month, leap-year, and DST boundaries', () => {
	for (const timezone of ['America/New_York', 'Asia/Shanghai', 'Pacific/Auckland']) inTimezone(timezone, () => {
		assert.deepEqual(buildDateTimeline(['2026-08-31', '2026-09-06'], 'day'), {
			categories: ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'], error: null,
		});
		assert.deepEqual(buildDateTimeline(['2024-02-28', '2024-03-01'], 'day').categories, ['2024-02-28', '2024-02-29', '2024-03-01']);
		assert.deepEqual(buildDateTimeline(['2026-03-07', '2026-03-10'], 'day').categories, ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
		assert.deepEqual(buildDateTimeline(['2026-10-31', '2026-11-02'], 'day').categories, ['2026-10-31', '2026-11-01', '2026-11-02']);
	});
});

test('calendar timeline uses whole weeks, months and years and preserves descending order', () => {
	assert.deepEqual(buildDateTimeline(['2026-12-28', '2027-01-11'], 'week').categories, ['2026-12-28', '2027-01-04', '2027-01-11']);
	assert.deepEqual(buildDateTimeline(['2027-02', '2026-11'], 'month').categories, ['2027-02', '2027-01', '2026-12', '2026-11']);
	assert.deepEqual(buildDateTimeline(['0099', '0101'], 'year').categories, ['0099', '0100', '0101']);
	assert.deepEqual(buildDateTimeline(['2026-01-01', '2026-01-01'], 'day').categories, ['2026-01-01']);
	assert.deepEqual(buildDateTimeline([], 'day'), { categories: [], error: null });
});

test('very large timelines fail explicitly without allocating an unbounded number of categories', () => {
	const first = new Date('2000-01-01T12:00:00Z');
	const last = new Date(first);
	last.setUTCDate(last.getUTCDate() + MAX_DATE_PERIODS - 1);
	assert.equal(buildDateTimeline(['2000-01-01', last.toISOString().slice(0, 10)], 'day').categories.length, MAX_DATE_PERIODS);
	last.setUTCDate(last.getUTCDate() + 1);
	const overflow = buildDateTimeline(['2000-01-01', last.toISOString().slice(0, 10)], 'day');
	assert.deepEqual(overflow.categories, []);
	assert.match(overflow.error, /10,000 periods/);
	assert.match(overflow.error, /Date grouping/);
	assert.match(buildDateTimeline(['not a date'], 'day').error, /Cannot build/);
});
