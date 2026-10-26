import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	entryPoints: [fileURLToPath(new URL('../src/dataCharts/groupColors.ts', import.meta.url))],
	bundle: true, write: false, format: 'esm', platform: 'node',
});
const { getGroupColorKeys, normalizeCustomColor, normalizeGroupColorChoice, readGroupColorConfig,
	withGroupColor, resolveGroupColorChoice, GROUP_COLOR_PRESETS } = await import(
	`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`,
);

// Public constructor.type tags were verified against the running Obsidian API.
// Names deliberately do not describe the type, matching the minified host.
function value(type, text) {
	return new (class a { static type = type; toString() { return text; } })();
}
function list(values) {
	return new (class b {
		static type = 'List';
		length() { return values.length; }
		get(index) { return values[index]; }
		toString() { return values.map(item => item.toString()).join(', '); }
	})();
}
function group(key) { return { key, entries: [], hasKey: () => key !== undefined && key?.constructor.type !== 'Null' }; }
const preset = id => ({ type: 'preset', value: id });
const custom = color => ({ type: 'custom', value: color });
const colorKey = (type, text) => JSON.stringify([type, text]);

test('group identities follow typed values across reordering and filtering, not display labels or constructor names', () => {
	const first = [group(value('String', 'Research')), group(value('String', 'Writing')), group(value('Number', '1')), group(value('String', '1'))];
	const keys = getGroupColorKeys(first);
	assert.deepEqual(keys, ['["String","Research"]', '["String","Writing"]', '["Number","1"]', '["String","1"]']);
	assert.deepEqual(getGroupColorKeys([first[3], first[0]]), [keys[3], keys[0]]);
	assert.deepEqual(getGroupColorKeys([group(value('String', 'Research'))]), [keys[0]], 'one visible group keeps its identity');
});

test('ungrouped, missing, empty, and similarly named literal values never share an override', () => {
	const keys = getGroupColorKeys([
		group(undefined), group(value('Null', 'null')), group(value('String', 'null')),
		group(value('String', '(No value)')), group(value('String', '')), group(value('String', '(Empty)')),
	]);
	assert.equal(keys[0], null);
	assert.equal(keys[1], '["Null"]');
	assert.equal(new Set(keys).size, keys.length);
});

test('recursive list identities distinguish delimiters, scalar types, nesting, and missing elements', () => {
	const keys = getGroupColorKeys([
		group(list([value('String', 'a, b')])),
		group(list([value('String', 'a'), value('String', 'b')])),
		group(list([value('Number', '1')])),
		group(list([value('String', '1')])),
		group(list([list([value('String', '1')])])),
		group(list([value('Null', 'null')])),
		group(value('String', '["Null"]')),
	]);
	assert.ok(keys.every(Boolean));
	assert.equal(new Set(keys).size, keys.length);
	assert.equal(keys[2], '["List",[["Number","1"]]]');
});

test('unsupported objects and duplicate canonical values stay automatic rather than aliasing another group', () => {
	const key = value('String', 'Same');
	assert.deepEqual(getGroupColorKeys([
		group(key), group(value('String', 'Same')), group(value('Object', '{}')),
		group(value('Unknown', 'Same')), group(value('String', 'Safe')),
	]), [null, null, null, null, '["String","Safe"]']);
	assert.deepEqual(getGroupColorKeys([group(value('Number', 'NaN')), group(value('Number', 'Infinity'))]), [null, null]);
	assert.deepEqual(getGroupColorKeys([group(list([value('Object', '{}')]))]), [null]);
});

test('cyclic/deep or oversized lists and long values cannot create unbounded keys', () => {
	const cycle = list([]);
	cycle.length = () => 1;
	cycle.get = () => cycle;
	assert.deepEqual(getGroupColorKeys([group(cycle)]), [null]);
	const tooMany = list([]);
	tooMany.length = () => 1025;
	assert.deepEqual(getGroupColorKeys([group(tooMany), group(value('String', 'x'.repeat(8193)))]), [null, null]);
});

test('custom colors normalize hexadecimal input and reject CSS or malformed strings', () => {
	assert.equal(normalizeCustomColor(' #aBc '), '#AABBCC');
	assert.equal(normalizeCustomColor('#012aFF'), '#012AFF');
	assert.equal(normalizeCustomColor('#000000'), '#000000');
	for (const invalid of [undefined, null, 0, '#', 'red', 'var(--color-red)', 'rgb(1,2,3)', '#abcd', '#12345678', '#12ZZ00']) {
		assert.equal(normalizeCustomColor(invalid), null);
	}
});

test('only named sequential presets are accepted and their hues adapt to the theme', () => {
	assert.deepEqual(GROUP_COLOR_PRESETS.map(p => p.id), ['gray', 'blue', 'green', 'yellow', 'purple', 'teal', 'orange', 'pink', 'red']);
	assert.equal(resolveGroupColorChoice(preset('purple'), false), '#9B7DB4');
	assert.equal(resolveGroupColorChoice(preset('purple'), true), '#BCA8CB');
	assert.equal(resolveGroupColorChoice(custom('#abc'), false), '#AABBCC');
	assert.equal(resolveGroupColorChoice(custom('#abc'), true), '#AABBCC');
	for (const choice of [null, undefined, preset('auto'), preset('coastal'), preset('__proto__'), { type: 'other', value: '#123456' }]) {
		assert.equal(normalizeGroupColorChoice(choice), null);
		assert.equal(resolveGroupColorChoice(choice, false), undefined);
	}
});

test('configuration validation keeps only own, canonical, valid entries and blocks prototype keys', () => {
	const validKey = colorKey('String', '__proto__');
	const source = JSON.parse('{"version":1,"overrides":{"__proto__":{"type":"preset","value":"red"},"constructor":{"type":"preset","value":"red"}}}');
	source.overrides[validKey] = custom('#abc');
	source.overrides[colorKey('String', 'Bad color')] = custom('red');
	source.overrides['[ "String", "Spacing" ]'] = preset('blue');
	source.overrides['["Object","{}"]'] = preset('blue');
	source.overrides['["List",[["String","Nested"]]]'] = preset('green');
	Object.setPrototypeOf(source.overrides, { [colorKey('String', 'Inherited')]: preset('red') });
	const config = readGroupColorConfig(source);
	assert.deepEqual(config, { version: 1, overrides: {
		[validKey]: custom('#AABBCC'), '["List",[["String","Nested"]]]': preset('green'),
	} });
	assert.equal(Object.prototype.type, undefined);
	for (const invalid of [undefined, null, false, [], {}, { version: 2, overrides: {} }, { version: 1, overrides: [] },
		Object.create({ version: 1, overrides: { [validKey]: preset('blue') } })]) {
		assert.deepEqual(readGroupColorConfig(invalid), { version: 1, overrides: {} });
	}
});

test('changing or resetting one color preserves hidden groups and never mutates the prior config', () => {
	const research = colorKey('String', 'Research');
	const hidden = colorKey('String', 'Hidden');
	const original = { version: 1, overrides: { [research]: preset('purple'), [hidden]: preset('green') } };
	const updated = withGroupColor(original, research, custom('#123abc'));
	assert.deepEqual(updated, { version: 1, overrides: { [research]: custom('#123ABC'), [hidden]: preset('green') } });
	assert.equal(original.overrides[research].value, 'purple');
	assert.notEqual(original.overrides[hidden], updated.overrides[hidden]);
	assert.deepEqual(withGroupColor(updated, research, null), { version: 1, overrides: { [hidden]: preset('green') } });
	assert.deepEqual(withGroupColor(updated, '__proto__', preset('red')), updated);
	assert.deepEqual(withGroupColor(updated, research, preset('unknown')), updated);
});
