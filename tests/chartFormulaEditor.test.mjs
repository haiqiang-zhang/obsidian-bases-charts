import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: [fileURLToPath(new URL('../src/ui/chartFormulaEditor.ts', import.meta.url))],
	bundle: true, write: false, format: 'cjs', platform: 'node',
	plugins: [{ name: 'formula-host-boundary', setup(builder) {
		builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
		builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
			export class Component {}
			export class Notice { constructor(text) { runtime.notices.push(text); } }
			export class NumberValue { constructor(data) { this.data = data; } }
			export class StringValue { constructor(data) { this.data = data; } }
			export class DateValue { constructor(data) { this.data = data; } }
			export class ListValue { constructor(data) { this.data = data; } }
			runtime.values = { NumberValue, StringValue, DateValue };
		` }));
	} }],
});

const parsed = (text, type = 'call') => ({ text, formula: { type } });

function harness({ legacy = true, formulas = {}, action = true } = {}) {
	const notices = [];
	const warnings = [];
	const timers = new Map();
	const cancelledTimers = [];
	const observers = [];
	let timerId = 0;
	let migration;
	let removedMigrations = 0;
	const win = {
		setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
		clearTimeout(id) { cancelledTimers.push(id); timers.delete(id); },
		MutationObserver: class {
			constructor(callback) { this.callback = callback; observers.push(this); }
			observe() { this.connected = true; }
			disconnect() { this.connected = false; }
		},
	};
	const doc = { defaultView: win, body: {} };
	const nativeAnchor = { ownerDocument: doc, isConnected: true };
	const anchor = {
		ownerDocument: doc, isConnected: true,
		onWindowMigrated(callback) { migration = callback; return () => { migration = null; removedMigrations++; }; },
	};
	const settings = new Map([['x', 'note.Completed']]);
	if (!legacy) settings.set('y', ['note.Amount']);
	const order = ['note.Amount'];
	const writes = [];
	const config = {
		get: key => settings.get(key),
		getAsPropertyId: key => settings.get(key) ?? null,
		set(key, value) { writes.push([key, value]); settings.set(key, value); },
	};
	const events = [];
	const listeners = new Set();
	const openedAxes = [];
	const view = {
		config, data: { data: [] }, getYProperties: () => settings.get('y') ?? order,
		getDefaultAggregateMode: () => 'Sum',
		events: {
			trigger(name) { events.push(name); for (const callback of [...listeners]) callback(); },
			on(name, callback) { listeners.add(callback); return callback; },
			offref(callback) { listeners.delete(callback); },
		},
		openAxisSettings(axis) { openedAxes.push({ axis, x: settings.get('x'), y: Array.from(this.getYProperties()) }); },
	};
	const query = { formulas: { ...formulas } };
	let editorState = null;
	const nativeCalls = { creates: 0, edits: [], closes: 0, autoDestroy: [] };
	const existingFormulaRow = { classList: { contains: cls => cls === 'mod-formula' }, querySelector: () => ({}), click() { throw new Error('Must not click an existing formula'); } };
	const addRow = {
		classList: { contains: () => false }, querySelector: () => ({}),
		click() {
			nativeCalls.creates++;
			query.formulas.Untitled = parsed('', 'empty');
			order.push('formula.Untitled');
			editorState = { name: 'Untitled', text: '', invalid: false, empty: true };
			menu.pageStack.push({});
		},
	};
	const menuClasses = new Set();
	const menuEl = {
		nodeType: 1, ownerDocument: doc, isConnected: false,
		classList: {
			contains: name => menuClasses.has(name),
			add: name => menuClasses.add(name),
			remove: name => menuClasses.delete(name),
		},
		querySelector(selector) {
			if (!editorState) return null;
			if (selector === '.formula-editor-status') return { classList: { contains: name => name === 'mod-error' ? editorState.invalid : name === 'mod-empty' && editorState.empty } };
			if (selector.includes('input[type="text"]')) return { value: editorState.name };
			return null;
		},
		querySelectorAll(selector) {
			if (selector === '.bases-toolbar-menu-item') return [existingFormulaRow, ...(action ? [addRow] : [])];
			if (selector === '.formula-editor .cm-line') return editorState?.text.split('\n').map(textContent => ({ textContent })) ?? [];
			return [];
		},
	};
	const page = { showEditPage(id, isNew) {
		nativeCalls.edits.push([id, isNew]);
		editorState = id.startsWith('formula.')
			? { name: id.slice(8), text: query.formulas[id.slice(8)].text, invalid: false, empty: false }
			: null;
		menu.pageStack.push({});
	} };
	const menu = {
		menuEl, parentEl: nativeAnchor, isOpen: false, pageStack: [],
		setAutoDestroy(element) { nativeCalls.autoDestroy.push(element); },
		setOpen(open) {
			this.isOpen = open; menuEl.isConnected = open;
			if (open) { editorState = null; this.pageStack = [page]; }
			else { this.pageStack = []; nativeCalls.closes++; }
		},
	};
	const controller = { query, view, propertyMenu: { toolbarItem: { enabled: true, menu } } };
	const module = { exports: {} };
	const runtime = { notices, values: {} };
	runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, runtime, console: { warn: (...args) => warnings.push(args) } });
	const adapter = new module.exports.ChartFormulaEditor(view, controller);
	adapter.onload();
	return {
		adapter, anchor, nativeAnchor, menu, menuEl, controller, query, view, config, settings,
		notices, warnings, events, writes, nativeCalls, observers, timers, cancelledTimers, openedAxes,
		values: runtime.values, listeners,
		flush() { for (const observer of observers) if (observer.connected) observer.callback([]); },
		tick() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
		setEditor(name, value, { invalid = false, empty = false } = {}) { editorState = { name, text: typeof value === 'string' ? value : value.text, invalid, empty }; },
		close() { menu.setOpen(false); this.flush(); },
		back() { menu.pageStack.pop(); editorState = null; this.flush(); },
		migrate() { migration?.(); },
		get removedMigrations() { return removedMigrations; },
	};
}

function assertClean(host) {
	assert.equal(host.menu.parentEl, host.nativeAnchor);
	assert.equal(host.menuEl.classList.contains('bases-chart-property-menu'), false);
	assert.ok(host.observers.every(observer => !observer.connected));
	assert.equal(host.timers.size, 0);
	assert.equal(host.removedMigrations, 1);
}

test('native Add formula preserves legacy Y and selects the final renamed X after blur', () => {
	const h = harness({ formulas: { Existing: parsed('1') } });
	h.adapter.open(h.anchor, 'x');
	assert.equal(h.nativeCalls.creates, 1);
	assert.equal(h.menu.parentEl, h.anchor);
	assert.equal(h.nativeCalls.autoDestroy[0], h.anchor);
	assert.deepEqual(Array.from(h.settings.get('y')), ['note.Amount']);
	assert.equal(h.settings.get('x'), 'note.Completed');
	h.query.formulas.Untitled = parsed('date(note.Completed).date()');
	h.setEditor('Day', h.query.formulas.Untitled);
	h.close();
	assert.equal(h.settings.get('x'), 'note.Completed', 'close must wait for the native name blur save');
	h.query.formulas.Day = h.query.formulas.Untitled;
	delete h.query.formulas.Untitled;
	h.tick();
	assert.equal(h.settings.get('x'), 'formula.Day');
	assert.deepEqual(Array.from(h.settings.get('y')), ['note.Amount']);
	assert.deepEqual(h.events, ['data-updated']);
	assertClean(h);
});

test('Y formula uses the latest selected values and never duplicates an already selected formula', () => {
	const h = harness({ legacy: false });
	h.adapter.open(h.anchor, 'y');
	h.query.formulas.Untitled = parsed('note.Amount * 2');
	h.settings.set('y', ['note.Other', 'formula.Untitled']);
	h.close(); h.tick();
	assert.deepEqual(h.settings.get('y'), ['note.Other', 'formula.Untitled']);
	assert.equal(h.settings.get('x'), 'note.Completed');
	assertClean(h);
});

for (const type of ['DateValue', 'StringValue', 'NumberValue']) {
	test(`new Y ${type} formula initializes aggregation from fresh native data`, () => {
		const h = harness();
		h.adapter.open(h.anchor, 'y');
		h.query.formulas.Untitled = parsed('1');
		// The old snapshot still has a numeric result for an earlier editor value.
		h.view.data = { data: [{ getValue: () => new h.values.NumberValue(99) }] };
		h.close(); h.tick();
		assert.equal(h.settings.has('aggregate:formula.Untitled'), false);
		assert.equal(h.listeners.size, 1);
		h.view.getDefaultAggregateMode = () => 'Average';
		const value = new h.values[type](type === 'NumberValue' ? 2 : '2026-10-26');
		h.view.data = { data: [{ getValue: () => value }] };
		h.view.events.trigger('data-updated');
		assert.equal(h.settings.get('aggregate:formula.Untitled'), type === 'NumberValue' ? 'Average' : 'Count');
		assert.equal(h.listeners.size, 0);
		assertClean(h);
	});
}

for (const change of ['setting', 'removed-y', 'deleted-formula', 'changed-query', 'changed-config', 'unload']) {
	test(`pending Y aggregate initialization is discarded after ${change}`, () => {
		const h = harness();
		h.adapter.open(h.anchor, 'y');
		h.query.formulas.Untitled = parsed('1');
		h.close(); h.tick();
		if (change === 'setting') h.settings.set('aggregate:formula.Untitled', 'Max');
		if (change === 'removed-y') h.settings.set('y', ['note.Amount']);
		if (change === 'deleted-formula') delete h.query.formulas.Untitled;
		if (change === 'changed-query') h.controller.query = {};
		if (change === 'changed-config') h.view.config = { ...h.config };
		if (change === 'unload') h.adapter.onunload();
		h.view.data = { data: [{ getValue: () => new h.values.StringValue('text') }] };
		h.view.events.trigger('data-updated');
		assert.equal(h.settings.get('aggregate:formula.Untitled'), change === 'setting' ? 'Max' : undefined);
		assert.equal(h.listeners.size, 0);
		assertClean(h);
	});
}

for (const property of ['note.Completed', 'file.name']) {
	for (const axis of ['x', 'y']) {
		test(`native ${property} editor returns to ${axis.toUpperCase()} without changing axis selections`, () => {
			const h = harness({ legacy: false });
			h.adapter.open(h.anchor, axis, property);
			assert.equal(h.menu.isOpen, true);
			assert.equal(h.menuEl.classList.contains('bases-chart-property-menu'), true);
			assert.deepEqual(h.nativeCalls.edits, [[property, false]]);
			assert.equal(h.nativeCalls.creates, 0);
			h.query.formulas.Unrelated = parsed('1');
			h.back(); h.tick();
			assert.deepEqual(h.writes, []);
			assert.deepEqual(h.openedAxes, [{ axis, x: 'note.Completed', y: ['note.Amount'] }]);
			assert.deepEqual(h.notices, []);
			assertClean(h);
		});
	}
}

test('ordinary property editor dismissal and unload remove only chart session styling', () => {
	for (const dismiss of ['outside', 'unload']) {
		const h = harness();
		h.menuEl.classList.add('bases-toolbar-menu');
		h.adapter.open(h.anchor, 'x', 'file.name');
		if (dismiss === 'outside') h.close(); else h.adapter.onunload();
		h.tick();
		assert.equal(h.menuEl.classList.contains('bases-toolbar-menu'), true);
		assert.deepEqual(h.openedAxes, []);
		assert.deepEqual(h.writes, []);
		assertClean(h);
	}
});

for (const axis of ['x', 'y']) {
	test(`native Back/Escape returns to ${axis.toUpperCase()} after saving and selecting the final new formula`, () => {
		const h = harness();
		h.adapter.open(h.anchor, axis);
		h.setEditor('Day', parsed('date(note.Completed).date()'));
		h.flush();
		h.back();
		assert.equal(h.menu.isOpen, false, 'native Properties must close in the observer microtask');
		assert.deepEqual(h.openedAxes, [], 'the axis must wait for native blur saves');
		assert.equal(h.nativeCalls.closes, 1);
		h.query.formulas.Day = parsed('date(note.Completed).date()');
		delete h.query.formulas.Untitled;
		h.tick();
		assert.deepEqual(h.openedAxes, [{
			axis,
			x: axis === 'x' ? 'formula.Day' : 'note.Completed',
			y: axis === 'y' ? ['note.Amount', 'formula.Day'] : ['note.Amount'],
		}]);
		assertClean(h);
	});
}

test('outside and close button dismissal save selection without reopening an axis panel', () => {
	const h = harness();
	h.adapter.open(h.anchor, 'x');
	h.query.formulas.Untitled = parsed('1');
	h.close(); h.tick();
	assert.equal(h.settings.get('x'), 'formula.Untitled');
	assert.deepEqual(h.openedAxes, []);
	assertClean(h);
});

test('nested native pages return to the formula editor before returning to the axis panel', () => {
	const h = harness();
	h.adapter.open(h.anchor, 'x');
	h.menu.pageStack.push({});
	h.back();
	assert.equal(h.menu.isOpen, true);
	assert.equal(h.timers.size, 0);
	assert.deepEqual(h.openedAxes, []);
	h.back(); h.tick();
	assert.equal(h.openedAxes.length, 1);
	assert.equal(h.openedAxes[0].axis, 'x');
	assertClean(h);
});

for (const change of ['unload', 'migrate', 'view', 'config', 'query', 'menu', 'anchor', 'document', 'reopened-menu']) {
	test(`Back completion does not reopen the axis after ${change}`, () => {
		const h = harness();
		h.adapter.open(h.anchor, 'x');
		h.query.formulas.Untitled = parsed('1');
		h.back();
		if (change === 'unload') h.adapter.onunload();
		if (change === 'migrate') h.migrate();
		if (change === 'view') h.controller.view = {};
		if (change === 'config') h.view.config = { ...h.config };
		if (change === 'query') h.controller.query = { ...h.query };
		if (change === 'menu') h.controller.propertyMenu.toolbarItem.menu = {};
		if (change === 'anchor') h.anchor.isConnected = false;
		if (change === 'document') h.anchor.ownerDocument = {};
		if (change === 'reopened-menu') h.menu.setOpen(true);
		h.tick();
		assert.deepEqual(h.openedAxes, []);
		assert.equal(h.settings.get('x'), 'note.Completed');
		assertClean(h);
	});
}

for (const reason of ['blank', 'invalid', 'ambiguous', 'changed-x', 'changed-view', 'changed-config', 'changed-query', 'reopened-menu']) {
	test(`formula completion does not replace X when ${reason}`, () => {
		const h = harness();
		h.adapter.open(h.anchor, 'x');
		h.query.formulas.Untitled = parsed('1');
		if (reason === 'blank') h.query.formulas.Untitled = parsed('', 'empty');
		if (reason === 'invalid') h.query.formulas.Untitled = parsed('1 +', 'invalid');
		if (reason === 'ambiguous') h.query.formulas.Second = parsed('2');
		if (reason === 'changed-x') h.settings.set('x', 'note.Other');
		if (reason === 'changed-view') h.controller.view = {};
		if (reason === 'changed-config') h.view.config = { ...h.config };
		if (reason === 'changed-query') h.controller.query = { ...h.query };
		h.close();
		if (reason === 'reopened-menu') h.menu.setOpen(true);
		h.tick();
		assert.equal(h.settings.get('x'), reason === 'changed-x' ? 'note.Other' : 'note.Completed');
		assert.deepEqual(h.events, []);
		assertClean(h);
	});
}

test('serialized formula strings require matching native validation state', () => {
	for (const valid of [false, true]) {
		const h = harness();
		h.adapter.open(h.anchor, 'x');
		h.query.formulas.Untitled = 'note.Amount + 1';
		h.setEditor('Untitled', 'note.Amount + 1', { invalid: !valid });
		h.close(); h.tick();
		assert.equal(h.settings.get('x'), valid ? 'formula.Untitled' : 'note.Completed');
		assertClean(h);
	}
});

test('editing an existing formula keeps axes unchanged, but a native key rename follows selected references', () => {
	const h = harness({ legacy: false, formulas: { Day: parsed('1') } });
	h.settings.set('x', 'formula.Day');
	h.settings.set('y', ['formula.Day', 'note.Amount']);
	h.adapter.open(h.anchor, 'x', 'formula.Day');
	assert.deepEqual(h.nativeCalls.edits, [['formula.Day', false]]);
	assert.equal(h.nativeCalls.creates, 0);
	h.close(); h.tick();
	assert.equal(h.settings.get('x'), 'formula.Day');
	assert.deepEqual(h.writes, []);
	assertClean(h);

	const renamed = harness({ legacy: false, formulas: { Day: parsed('1') } });
	renamed.settings.set('x', 'formula.Day');
	renamed.settings.set('y', ['formula.Day', 'note.Amount']);
	renamed.adapter.open(renamed.anchor, 'x', 'formula.Day');
	renamed.query.formulas.Date = renamed.query.formulas.Day;
	delete renamed.query.formulas.Day;
	renamed.setEditor('Date', parsed('1'));
	renamed.close(); renamed.tick();
	assert.equal(renamed.settings.get('x'), 'formula.Date');
	assert.deepEqual(Array.from(renamed.settings.get('y')), ['formula.Date', 'note.Amount']);
	assertClean(renamed);
});

test('deleting a selected formula clears only its X/Y references before returning to the axis', () => {
	const h = harness({ legacy: false, formulas: { Day: parsed('1') } });
	h.settings.set('x', 'formula.Day');
	h.settings.set('y', ['note.Amount', 'formula.Day', 'note.Other']);
	h.adapter.open(h.anchor, 'x', 'formula.Day');
	delete h.query.formulas.Day;
	h.back(); h.tick();
	assert.equal(h.settings.get('x'), null);
	assert.deepEqual(Array.from(h.settings.get('y')), ['note.Amount', 'note.Other']);
	assert.deepEqual(h.openedAxes, [{ axis: 'x', x: null, y: ['note.Amount', 'note.Other'] }]);
	assert.deepEqual(h.events, ['data-updated']);
	assertClean(h);
});

test('deletion preserves a changed X and never selects an unrelated new formula', () => {
	const h = harness({ legacy: false, formulas: { Day: parsed('1') } });
	h.settings.set('x', 'formula.Day');
	h.settings.set('y', ['formula.Day', 'note.Amount']);
	h.adapter.open(h.anchor, 'y', 'formula.Day');
	h.settings.set('x', 'note.Other');
	delete h.query.formulas.Day;
	h.query.formulas.Unrelated = parsed('2');
	h.back(); h.tick();
	assert.equal(h.settings.get('x'), 'note.Other');
	assert.deepEqual(Array.from(h.settings.get('y')), ['note.Amount']);
	assert.equal(h.writes.length, 1);
	assert.equal(h.writes[0][0], 'y');
	assertClean(h);
});

test('deleting an unselected formula does not write either custom axis', () => {
	const h = harness({ legacy: false, formulas: { Day: parsed('1') } });
	h.adapter.open(h.anchor, 'x', 'formula.Day');
	delete h.query.formulas.Day;
	h.query.formulas.Unrelated = parsed('2');
	h.back(); h.tick();
	assert.deepEqual(h.writes, []);
	assert.deepEqual(h.events, []);
	assertClean(h);
});

test('native deletion retains legacy Y configuration without converting it to explicit Y', () => {
	const h = harness({ formulas: { Day: parsed('1') } });
	h.view.getYProperties().push('formula.Day');
	h.adapter.open(h.anchor, 'x', 'formula.Day');
	delete h.query.formulas.Day;
	h.view.getYProperties().splice(1, 1);
	h.back(); h.tick();
	assert.equal(h.settings.has('y'), false);
	assert.deepEqual(h.view.getYProperties(), ['note.Amount']);
	assert.deepEqual(h.writes, []);
	assertClean(h);
});

test('unload and window migration close only the owned menu and discard pending selection', () => {
	for (const action of ['unload-open', 'unload-pending', 'migrate']) {
		const h = harness();
		h.adapter.open(h.anchor, 'x');
		h.query.formulas.Untitled = parsed('1');
		if (action === 'unload-pending') h.close();
		if (action === 'migrate') h.migrate(); else h.adapter.onunload();
		h.flush(); h.tick();
		assert.equal(h.menu.isOpen, false);
		assert.equal(h.settings.get('x'), 'note.Completed');
		assertClean(h);
		if (action !== 'migrate') assert.equal(h.adapter.canOpen(), false);
	}
});

test('unsupported native menu and missing native action fail without changing axes', () => {
	const h = harness();
	h.controller.propertyMenu = undefined;
	assert.equal(h.adapter.canOpen(), false);
	h.adapter.open(h.anchor, 'x');
	assert.equal(h.notices.length, 1);
	assert.deepEqual(h.writes, []);

	const missing = harness({ action: false });
	missing.adapter.open(missing.anchor, 'x');
	assert.equal(missing.notices.length, 1);
	assert.equal(missing.menu.isOpen, false);
	assert.equal(missing.nativeCalls.creates, 0);
	assert.deepEqual(missing.writes, []);
	assertClean(missing);
});
