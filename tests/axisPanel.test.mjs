import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
			export { ChartToolbar } from './src/ui/chartToolbar.ts';
			export { StringValue, NumberValue } from 'obsidian';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'axis-panel-host-controls',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, () => ({
				contents: `
					export class Component { registerEvent() {} }
					export function setIcon(element, icon) { element.dataset.icon = icon; }
					export class SearchComponent {
						constructor(container) { this.inputEl = container.createEl('input', { type: 'search' }); }
						setPlaceholder(value) { this.inputEl.placeholder = value; return this; }
						onChange(callback) { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
					}
					export class DropdownComponent {
						constructor(container) { this.selectEl = container.createEl('select', { cls: 'dropdown' }); }
						addOption(value, label) { this.selectEl.createEl('option', { value, text: label }); return this; }
						setValue(value) { this.selectEl.value = value; return this; }
						onChange(callback) { this.selectEl.addEventListener('change', () => callback(this.selectEl.value)); return this; }
					}
					class Value { constructor(data) { this.data = data; } toString() { return String(this.data); } }
					export class StringValue extends Value {}
					export class NumberValue extends Value {}
					export class DateValue extends Value {}
					export class ListValue extends Value {}
				`,
			}));
		},
	}],
});
const { ChartToolbar, StringValue, NumberValue } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=axis-panel-under-test.mjs`).toString('base64')}`);

class EventTargetFixture {
	listeners = new Map();
	addEventListener(name, callback) {
		if (!this.listeners.has(name)) this.listeners.set(name, new Set());
		this.listeners.get(name).add(callback);
	}
	removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
	emit(name, event) { for (const callback of [...(this.listeners.get(name) ?? [])]) callback(event); }
}

function eventFor(target, extra = {}) {
	return {
		target, defaultPrevented: false, stopped: false,
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.stopped = true; },
		composedPath() {
			const path = [];
			for (let node = target; node; node = node.parentElement) path.push(node);
			return [...path, target.ownerDocument];
		},
		...extra,
	};
}

class Element extends EventTargetFixture {
	children = [];
	parentElement = null;
	attributes = new Map();
	dataset = {};
	value = '';
	disabled = false;
	style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
	constructor(doc, tag = 'div', options = {}) {
		super();
		this.ownerDocument = doc;
		this.tag = tag;
		this.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		this.textContent = options.text ?? '';
		this.value = options.value ?? '';
		for (const [key, value] of Object.entries(options.attr ?? {})) this.setAttribute(key, value);
	}
	get classList() { return { contains: name => this.classes.has(name) }; }
	createEl(tag, options) {
		const child = new Element(this.ownerDocument, tag, options);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	addClass(cls) { this.classes.add(cls); }
	removeClass(cls) { this.classes.delete(cls); }
	setText(text) { this.textContent = text; }
	setAttribute(key, value) { this.attributes.set(key, value); }
	getAttribute(key) { return this.attributes.get(key) ?? null; }
	getBoundingClientRect() { return { left: 500, right: 720, top: 40, bottom: 76 }; }
	empty() { for (const child of this.children) child.parentElement = null; this.children = []; }
	remove() {
		if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
		this.parentElement = null;
	}
	matches(selector) { return selector.startsWith('.') ? this.classes.has(selector.slice(1)) : this.tag === selector; }
	querySelectorAll(selector) {
		const found = [];
		for (const child of this.children) {
			if (child.matches(selector)) found.push(child);
			found.push(...child.querySelectorAll(selector));
		}
		return found;
	}
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
	focus() {
		this.ownerDocument.activeElement = this;
		this.ownerDocument.emit('focusin', eventFor(this));
	}
	dispatch(name, extra) {
		if (name === 'click' && this.disabled) return;
		const event = eventFor(this, extra);
		for (let node = this; node && !event.stopped; node = node.parentElement) node.emit(name, event);
		if (!event.stopped) this.ownerDocument.emit(name, event);
		return event;
	}
}

function harness(x = 'formula.bucket') {
	const doc = new EventTargetFixture();
	doc.defaultView = new EventTargetFixture();
	Object.assign(doc.defaultView, { innerWidth: 1000, innerHeight: 800 });
	doc.body = new Element(doc);
	const nativeToolbar = doc.body.createDiv({ cls: 'bases-toolbar' });
	const container = new Element(doc);
	container.parentElement = { querySelector: selector => {
		assert.equal(selector, ':scope > .bases-header .bases-toolbar');
		return nativeToolbar;
	} };
	const names = new Map(Object.entries({
		'file.folder': 'Folder', 'note.status': 'Status', 'formula.bucket': 'Bucket',
		'note.hours': 'Hours', 'note.score': 'Score', 'note.mood': 'Mood', 'formula.ratio': 'Ratio',
	}));
	const settings = new Map(Object.entries({ x, y: ['note.hours', 'note.score'], 'aggregate:note.hours': 'Sum', 'aggregate:note.score': 'Average' }));
	const writes = [];
	const updates = [];
	const view = {
		type: 'chart-bar', containerEl: container,
		// The selected formula is deliberately absent: old saved properties must still show.
		allProperties: ['file.folder', 'note.status', 'note.hours', 'note.score', 'note.mood', 'formula.ratio', 'file.folder'],
		config: {
			get: key => settings.get(key),
			getAsPropertyId: key => settings.get(key) ?? null,
			getDisplayName: id => names.get(id) ?? id,
			set: (key, value) => { assert.notEqual(key, 'order'); writes.push({ key, value }); settings.set(key, value); },
		},
		getYProperties: () => [...settings.get('y')],
		getAggregateModeForProperty: id => settings.get(`aggregate:${id}`) ?? 'Sum',
		getDefaultAggregateMode: () => 'Sum',
		data: { data: [{ getValue: id => id === 'note.mood' ? new StringValue('Good') : new NumberValue(4) }] },
		events: { on: (_name, callback) => { updates.push(callback); return {}; }, trigger: () => updates.forEach(callback => callback()) },
	};
	const toolbar = new ChartToolbar(view);
	toolbar.onload();
	return {
		doc, toolbar, settings, writes,
		button: axis => nativeToolbar.querySelector(`.bases-chart-${axis}-menu`).querySelector('button'),
		panel: () => doc.body.querySelector('.bases-chart-axis-panel'),
	};
}

function selectedRows(panel) { return panel.querySelector('.bases-chart-selected-properties').querySelectorAll('.bases-chart-selected-property'); }
function candidates(panel) { return panel.querySelector('.bases-chart-property-results').querySelectorAll('.bases-chart-property-option'); }
function searchInput(panel) { return panel.querySelector('.bases-chart-property-search').querySelector('input'); }
function action(row, label) { return row.querySelectorAll('button').find(button => button.getAttribute('aria-label') === label); }

for (const x of ['file.folder', 'note.status', 'formula.bucket']) {
	test(`${x} stays above search and out of candidates, including an unmatched search`, () => {
		const state = harness(x);
		state.toolbar.openAxis('x');
		const panel = state.panel();
		const selection = panel.querySelector('.bases-chart-selection');
		const searchContainer = panel.querySelector('.bases-chart-property-search');
		const search = searchInput(panel);
		assert.ok(panel.children.indexOf(selection) < panel.children.indexOf(searchContainer));
		assert.deepEqual(selectedRows(panel).map(row => row.dataset.property), [x]);
		assert.ok(candidates(panel).every(row => row.dataset.property !== x));
		assert.equal(new Set(candidates(panel).map(row => row.dataset.property)).size, candidates(panel).length);
		search.value = 'there-is-no-matching-property';
		search.dispatch('input');
		assert.equal(searchInput(panel), search, 'search component must remain mounted during rerenders');
		assert.equal(search.value, 'there-is-no-matching-property');
		assert.deepEqual(selectedRows(panel).map(row => row.dataset.property), [x]);
		assert.equal(candidates(panel).length, 0);
		assert.equal(selectedRows(panel)[0].querySelectorAll('button').length, 0);
		search.value = '';
		search.dispatch('input');
		assert.equal(panel.querySelectorAll('.bases-chart-selected-property').length, 1);
		assert.ok(candidates(panel).every(row => row.dataset.property !== x));
		state.toolbar.onunload();
	});
}

test('replacing X saves the property, closes the panel, and restores toolbar focus', () => {
	const state = harness();
	state.toolbar.openAxis('x');
	candidates(state.panel()).find(row => row.dataset.property === 'file.folder').dispatch('click');
	assert.equal(state.settings.get('x'), 'file.folder');
	assert.equal(state.panel(), null);
	assert.equal(state.button('x').getAttribute('aria-expanded'), 'false');
	assert.equal(state.doc.activeElement, state.button('x'));
	assert.deepEqual(state.writes, [{ key: 'x', value: 'file.folder' }]);
	state.toolbar.onunload();
});

test('Y aggregation, reorder, add, and remove keep their existing configuration behavior', () => {
	const state = harness();
	state.toolbar.openAxis('y');
	const panel = state.panel();
	let rows = selectedRows(panel);
	const hours = rows.find(row => row.dataset.property === 'note.hours');
	const aggregate = hours.querySelector('select');
	assert.equal(aggregate.value, 'Sum');
	aggregate.value = 'Max';
	aggregate.dispatch('change');
	assert.equal(state.settings.get('aggregate:note.hours'), 'Max');
	action(rows.find(row => row.dataset.property === 'note.score'), 'Move Score up').dispatch('click');
	assert.deepEqual(state.settings.get('y'), ['note.score', 'note.hours']);
	assert.deepEqual(selectedRows(panel).map(row => row.dataset.property), ['note.score', 'note.hours']);
	candidates(panel).find(row => row.dataset.property === 'note.mood').dispatch('click');
	assert.deepEqual(state.settings.get('y'), ['note.score', 'note.hours', 'note.mood']);
	assert.equal(state.settings.get('aggregate:note.mood'), 'Count');
	assert.ok(candidates(panel).every(row => !state.settings.get('y').includes(row.dataset.property)));
	assert.equal(panel.querySelector('.bases-chart-selection-count').textContent, '3');
	rows = selectedRows(panel);
	action(rows.find(row => row.dataset.property === 'note.score'), 'Remove Score').dispatch('click');
	assert.deepEqual(state.settings.get('y'), ['note.hours', 'note.mood']);
	assert.equal(state.settings.get('aggregate:note.hours'), 'Max');
	assert.equal(selectedRows(panel)[0].querySelector('select').value, 'Max');
	assert.equal(panel.querySelector('.bases-chart-selection-count').textContent, '2');
	assert.equal(state.panel(), panel, 'Y edits should keep the panel open');
	assert.equal(state.doc.activeElement, searchInput(panel));
	state.toolbar.onunload();
});

test('Escape closes the panel, clears document listeners, and restores the trigger focus', () => {
	const state = harness();
	state.toolbar.openAxis('x');
	const search = searchInput(state.panel());
	assert.equal(state.doc.activeElement, search);
	const event = search.dispatch('keydown', { key: 'Escape' });
	assert.equal(event.defaultPrevented, true);
	assert.equal(state.panel(), null);
	assert.equal(state.doc.activeElement, state.button('x'));
	assert.equal(state.doc.listeners.get('keydown').size, 0);
	assert.equal(state.doc.listeners.get('pointerdown').size, 0);
	assert.equal(state.doc.listeners.get('focusin').size, 0);
	assert.equal(state.doc.defaultView.listeners.get('resize').size, 0);
	state.toolbar.onunload();
});

test('candidate keyboard navigation supports arrows, Home, and End without losing the selection', () => {
	const state = harness();
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const search = searchInput(panel);
	const options = candidates(panel);
	search.dispatch('keydown', { key: 'ArrowDown' });
	assert.equal(state.doc.activeElement, options[0]);
	options[0].dispatch('keydown', { key: 'End' });
	assert.equal(state.doc.activeElement, options.at(-1));
	options.at(-1).dispatch('keydown', { key: 'Home' });
	assert.equal(state.doc.activeElement, options[0]);
	options[0].dispatch('keydown', { key: 'ArrowDown' });
	assert.equal(state.doc.activeElement, options[1]);
	options[1].dispatch('keydown', { key: 'ArrowUp' });
	assert.equal(state.doc.activeElement, options[0]);
	options[0].dispatch('keydown', { key: 'ArrowUp' });
	assert.equal(state.doc.activeElement, search);
	assert.deepEqual(selectedRows(panel).map(row => row.dataset.property), ['formula.bucket']);
	state.toolbar.onunload();
});
