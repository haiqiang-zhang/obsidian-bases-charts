import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Obsidian only ships type declarations outside the app. This helper deliberately
// consumes the public group shape without depending on Obsidian's runtime.
const result = await build({
	entryPoints: [fileURLToPath(new URL('../src/dataCharts/grouping.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
});
const { prepareChartGroups } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function group(label, entries, hasKey = true) {
	return {
		key: label === undefined ? undefined : { toString: () => label },
		entries,
		hasKey: () => hasKey,
	};
}

test('same display label keeps groups and their aggregate identities separate', () => {
	const numericEntry = { file: { path: 'numeric.md' } };
	const textEntry = { file: { path: 'text.md' } };
	const groups = prepareChartGroups([
		group('1', [numericEntry]),
		group('1', [textEntry]),
	]);

	assert.deepEqual(groups.map(g => g.groupIndex), [0, 1]);
	assert.deepEqual(groups.map(g => g.label), ['1', '1 (2)']);
	assert.deepEqual(groups.map(g => g.entries), [[numericEntry], [textEntry]]);
});

test('missing values stay distinct from the literal text null and No value', () => {
	const groups = prepareChartGroups([
		group('null', [{ id: 'missing' }], false),
		group('null', [{ id: 'literal-null' }]),
		group('(No value)', [{ id: 'literal-label' }]),
	]);

	assert.deepEqual(groups.map(g => g.groupIndex), [0, 1, 2]);
	assert.deepEqual(groups.map(g => g.label), ['(No value)', 'null', '(No value) (2)']);
});

test('selected groups retain Bases order and exclude entries from hidden groups', () => {
	const ungroupedEntries = [{ folder: 'A' }, { folder: 'B' }, { folder: 'C' }];
	const groups = prepareChartGroups([
		group('C', [ungroupedEntries[2]]),
		group('A', [ungroupedEntries[0]]),
	]);

	assert.deepEqual(groups.map(g => g.label), ['C', 'A']);
	assert.deepEqual(groups.flatMap(g => g.entries).map(entry => entry.folder), ['C', 'A']);
});

test('ungrouped results and empty groups are safe', () => {
	assert.deepEqual(prepareChartGroups([]), []);
	const entries = [{ file: { path: 'root.md' } }];
	assert.deepEqual(prepareChartGroups([group(undefined, entries, false)]), [
		{ groupIndex: 0, label: 'All files', entries },
	]);
});

test('empty folder labels and duplicate suffixes do not alias another group', () => {
	const groups = prepareChartGroups([
		group('', []), group('(Empty)', []), group('(Empty) (2)', []),
	]);
	assert.equal(new Set(groups.map(g => g.label)).size, 3);
	assert.deepEqual(groups.map(g => g.groupIndex), [0, 1, 2]);
});
