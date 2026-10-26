import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
			export { ChartToolbar } from './src/ui/chartToolbar.ts';
			export { StringValue, NumberValue, Menu, Modal, Platform } from 'obsidian';
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
					export const Platform = { isMobile: false, isPhone: false };
					export class Modal {
						static instances = [];
						constructor(app) {
							this.app = app;
							this.containerEl = app.doc.body.createDiv({ cls: 'modal-container' });
							this.containerEl.remove();
							this.modalEl = this.containerEl.createDiv({ cls: 'modal' });
							this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' });
							this.closeButton = this.modalEl.createEl('button', { attr: { 'aria-label': 'Close' } });
							this.closeButton.addEventListener('click', () => this.close());
							this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
							Modal.instances.push(this);
						}
						setTitle(title) { this.titleEl.setText(title); return this; }
						setCloseCallback(callback) { this.closeCallback = callback; return this; }
						open() {
							this.opened = true;
							this.containerEl.parentElement = this.app.doc.body;
							this.app.doc.body.children.push(this.containerEl);
							this.closeButton.focus();
						}
						close() {
							if (!this.opened) return;
							this.opened = false;
							this.containerEl.remove();
							this.closeCallback?.();
						}
						onHistoryBack() { this.close(); }
					}
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
					export class ToggleComponent {
						constructor(container) {
							this.toggleEl = container.createEl('button', { cls: 'checkbox-container' });
							this.toggleEl.setAttribute('role', 'switch');
							this.toggleEl.addEventListener('click', () => {
								if (!this.disabled) { this.setValue(!this.value); this.callback?.(this.value); }
							});
						}
						setValue(value) { this.value = value; this.toggleEl.setAttribute('aria-checked', String(value)); return this; }
						setDisabled(value) { this.disabled = value; this.toggleEl.disabled = value; return this; }
						setTooltip(value) { this.toggleEl.setAttribute('aria-label', value); return this; }
						onChange(callback) { this.callback = callback; return this; }
					}
					export class Menu {
						static instances = [];
						static preference = false;
						items = [];
						overrides = [];
						constructor() { this.useNativeMenu = Menu.preference; Menu.instances.push(this); }
						setUseNativeMenu(value) { this.overrides.push(value); this.useNativeMenu = value; return this; }
						setParentElement(parent) { this.parent = parent; return this; }
						addItem(callback) {
							const item = {
								setTitle(value) { this.title = value; return this; },
								setChecked(value) { this.checked = value; return this; },
								setIcon(value) { this.icon = value; return this; },
								setDisabled(value) { this.disabled = value; return this; },
								onClick(value) { this.callback = value; return this; },
							};
							callback(item); this.items.push(item); return this;
						}
						addSeparator() { return this; }
						onHide(callback) { this.hideCallback = callback; }
						showAtPosition(position, doc) {
							this.position = position; this.doc = doc; this.hidden = false;
							if (this.useNativeMenu) return this;
							this.element = doc.body.createDiv({ cls: 'menu' });
							this.background = doc.body.createDiv({ cls: 'suggestion-bg' });
							for (const item of this.items) {
								item.element = this.element.createEl('button', { text: item.title });
								item.element.disabled = item.disabled ?? false;
								item.element.addEventListener('click', () => { item.callback(); this.hide(); });
							}
							return this;
						}
						hide() {
							this.hidden = true; this.element?.remove(); this.background?.remove();
							const callback = this.hideCallback; this.hideCallback = null; callback?.(); return this;
						}
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
const { ChartToolbar, StringValue, NumberValue, Menu, Modal, Platform } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=axis-panel-under-test.mjs`).toString('base64')}`);

class EventTargetFixture {
	listeners = new Map();
	captureOptions = new WeakMap();
	addEventListener(name, callback, options) {
		if (!this.listeners.has(name)) this.listeners.set(name, new Set());
		this.listeners.get(name).add(callback);
		this.captureOptions.set(callback, options === true || options?.capture === true);
	}
	removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
	emit(name, event, capture) {
		for (const callback of [...(this.listeners.get(name) ?? [])]) {
			if (capture !== undefined && this.captureOptions.get(callback) !== capture) continue;
			callback(event);
			if (event.immediateStopped) break;
		}
	}
}

function eventFor(target, extra = {}) {
	return {
		target, defaultPrevented: false, stopped: false,
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.stopped = true; },
		stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; },
		composedPath() {
			const path = [];
			for (let node = target; node; node = node.parentElement) path.push(node);
			return [...path, target.ownerDocument, target.ownerDocument.defaultView];
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
	get isConnected() {
		for (let node = this; node; node = node.parentElement) if (node === this.ownerDocument.body) return true;
		return false;
	}
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
	getBoundingClientRect() { return { left: 500, right: 720, top: 40, bottom: 76, width: 220, height: 36 }; }
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
		const event = eventFor(this, { type: name, ...extra });
		const path = event.composedPath();
		for (const target of [...path].reverse()) {
			if (event.stopped) break;
			target.emit(name, event, true);
		}
		for (const target of path) {
			if (event.stopped) break;
			target.emit(name, event, false);
		}
		return event;
	}
}

function harness(x = 'formula.bucket', { date = false, formulaEditor = true, grouping = 'exact', mobile = false, type = 'chart-bar' } = {}) {
	Platform.isMobile = mobile;
	Platform.isPhone = mobile;
	const doc = new EventTargetFixture();
	doc.defaultView = new EventTargetFixture();
	Object.assign(doc.defaultView, { innerWidth: 1000, innerHeight: 800 });
	if (mobile) {
		doc.defaultView.visualViewport = new EventTargetFixture();
		doc.defaultView.visualViewport.height = 800;
	}
	Object.defineProperty(doc.defaultView, 'event', { get() { throw new Error('do not read deprecated window.event'); } });
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
		'note.completed at': 'Completed at',
	}));
	const settings = new Map(Object.entries({ x, y: ['note.hours', 'note.score'], 'aggregate:note.hours': 'Sum', 'aggregate:note.score': 'Average' }));
	if (grouping !== 'exact') settings.set('x-date-grouping', { property: x, unit: grouping });
	const writes = [];
	const updates = [];
	const formulaCalls = [];
	let updateCount = 0;
	const view = {
		type, containerEl: container, app: { doc },
		// The selected formula is deliberately absent: old saved properties must still show.
		allProperties: ['file.folder', 'note.status', 'note.hours', 'note.score', 'note.mood', 'formula.ratio', 'file.folder'],
		config: {
			get: key => settings.get(key),
			getAsPropertyId: key => settings.get(key) ?? null,
			getDisplayName: id => names.get(id) ?? id,
			set: (key, value) => { assert.notEqual(key, 'order'); writes.push({ key, value }); settings.set(key, value); },
		},
		getYProperties: () => [...settings.get('y')],
		isDateXAxis: () => date,
		getXDateGrouping: () => settings.get('x-date-grouping')?.unit ?? 'exact',
		setXDateGrouping: unit => view.config.set('x-date-grouping', { property: settings.get('x'), unit }),
		supportsMissingDates: () => date && ['chart-bar', 'chart-line', 'chart-area', 'chart-scatter'].includes(type),
		getShowMissingDates: () => settings.get('x-date-gaps')?.property === settings.get('x') && settings.get('x-date-gaps')?.enabled === true,
		setShowMissingDates: enabled => view.config.set('x-date-gaps', { property: settings.get('x'), enabled }),
		canEditFormulas: () => formulaEditor,
		openFormulaEditor: (anchor, axis, propertyId) => {
			assert.equal(doc.body.querySelector('.bases-chart-axis-panel'), null, 'close the picker before opening the native editor');
			for (const event of ['pointerdown', 'keydown', 'focusin']) assert.equal(doc.listeners.get(event)?.size ?? 0, 0);
			assert.equal(doc.defaultView.listeners.get('keydown')?.size ?? 0, 0);
			assert.equal(doc.defaultView.listeners.get('resize')?.size ?? 0, 0);
			formulaCalls.push({ anchor, axis, propertyId });
		},
		getAggregateModeForProperty: id => settings.get(`aggregate:${id}`) ?? 'Sum',
		getDefaultAggregateMode: () => 'Sum',
		data: { data: [{ getValue: id => id === 'note.mood' ? new StringValue('Good') : new NumberValue(4) }] },
		events: { on: (_name, callback) => { updates.push(callback); return {}; }, trigger: () => { updateCount++; updates.forEach(callback => callback()); } },
	};
	const toolbar = new ChartToolbar(view);
	toolbar.onload();
	return {
		doc, toolbar, settings, writes, formulaCalls,
		get updateCount() { return updateCount; },
		button: axis => nativeToolbar.querySelector(`.bases-chart-${axis}-menu`).querySelector('button'),
		panel: () => doc.body.querySelector('.bases-chart-axis-panel'),
	};
}

function selectedRows(panel) { return panel.querySelector('.bases-chart-selected-properties').querySelectorAll('.bases-chart-selected-property'); }
function candidates(panel) { return panel.querySelector('.bases-chart-property-results').querySelectorAll('.bases-chart-property-option'); }
function searchInput(panel) { return panel.querySelector('.bases-chart-property-search').querySelector('input'); }
function action(row, label) { return row.querySelectorAll('button').find(button => button.getAttribute('aria-label') === label); }
function propertyMenu(panel, id) {
	selectedRows(panel).find(row => row.dataset.property === id).querySelector('.bases-chart-property-more').dispatch('click');
	return Menu.instances.at(-1);
}

test('mobile axes use a native modal and do not focus search on opening', () => {
	const state = harness('note.completed at', { mobile: true, date: true });
	state.toolbar.openAxis('x');
	const modal = Modal.instances.at(-1);
	const panel = state.panel();
	assert.equal(modal.opened, true);
	assert.equal(modal.contentEl, panel);
	assert.equal(modal.titleEl.textContent, 'X axis');
	assert.equal(modal.modalEl.classList.contains('bases-chart-axis-modal'), true);
	assert.equal(modal.modalEl.classList.contains('mod-lg'), true);
	assert.equal(panel.querySelector('.bases-chart-panel-header'), null, 'use the native modal header');
	assert.equal(state.doc.activeElement, panel);
	assert.notEqual(state.doc.activeElement, searchInput(panel));
	modal.closeButton.focus();
	assert.equal(state.panel(), panel, 'native header controls belong to the picker');
	state.toolbar.onunload();
	assert.equal(modal.opened, false);
});

test('mobile keyboard viewport changes keep the picker and active search intact', () => {
	const state = harness('note.completed at', { mobile: true, date: true });
	state.toolbar.openAxis('x');
	const modal = Modal.instances.at(-1);
	const panel = state.panel();
	const search = searchInput(panel);
	search.focus();
	search.value = 'hours';
	search.dispatch('input');
	const viewport = state.doc.defaultView.visualViewport;
	viewport.height = 360;
	viewport.emit('resize', {});
	assert.equal(state.panel(), panel);
	assert.equal(modal.opened, true);
	assert.equal(search.value, 'hours');
	assert.equal(state.doc.activeElement, search);
	assert.equal(panel.style.values.get('--chart-panel-height'), '360px');
	assert.equal(modal.modalEl.style.values.get('--chart-panel-viewport-height'), '360px');
	viewport.height = 800;
	state.doc.defaultView.emit('resize', {});
	assert.equal(state.panel(), panel);
	assert.equal(panel.style.values.get('--chart-panel-height'), '800px');
	state.toolbar.onunload();
	assert.equal(viewport.listeners.get('resize').size, 0);
});

for (const close of ['native-close', 'back', 'toolbar']) test(`mobile ${close} cleans up the picker and its child menu`, () => {
	const state = harness('note.completed at', { mobile: true, date: true });
	state.toolbar.openAxis('x');
	const modal = Modal.instances.at(-1);
	const dropdown = state.panel().querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	const menu = Menu.instances.at(-1);
	if (close === 'native-close') modal.closeButton.dispatch('click');
	else if (close === 'back') modal.onHistoryBack();
	else state.toolbar.openAxis('x');
	assert.equal(state.panel(), null);
	assert.equal(modal.opened, false);
	assert.equal(menu.hidden, true);
	assert.equal(state.button('x').getAttribute('aria-expanded'), 'false');
	for (const event of ['pointerdown', 'keydown', 'focusin']) assert.equal(state.doc.listeners.get(event)?.size ?? 0, 0);
	assert.equal(state.doc.defaultView.listeners.get('resize').size, 0);
	assert.equal(state.doc.defaultView.visualViewport.listeners.get('resize').size, 0);
	state.toolbar.openAxis('x');
	assert.notEqual(state.panel(), null, 'picker can reopen after native dismissal');
	state.toolbar.onunload();
});

test('mobile Y edits never focus search unless the user is already searching', () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const search = searchInput(panel);
	candidates(panel).find(row => row.dataset.property === 'note.mood').dispatch('click');
	assert.equal(state.settings.get('aggregate:note.mood'), 'Count');
	assert.equal(state.doc.activeElement, panel);
	propertyMenu(panel, 'note.score').items.find(item => item.title === 'Move up').element.dispatch('click');
	assert.notEqual(state.doc.activeElement, search);
	propertyMenu(panel, 'note.mood').items.find(item => item.title === 'Remove').element.dispatch('click');
	assert.equal(state.doc.activeElement, panel);
	search.focus();
	search.value = 'Mood';
	search.dispatch('input');
	candidates(panel).find(row => row.dataset.property === 'note.mood').dispatch('click');
	assert.equal(state.doc.activeElement, search, 'preserve a search session that is still focused');
	assert.equal(search.value, 'Mood');
	state.toolbar.onunload();
});

test('mobile native formula editing closes the axis modal before handoff', () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('x');
	const modal = Modal.instances.at(-1);
	action(selectedRows(state.panel())[0], 'Edit formula: Bucket').dispatch('click');
	assert.equal(modal.opened, false);
	assert.equal(state.panel(), null);
	assert.equal(state.formulaCalls[0].propertyId, 'formula.bucket');
	assert.equal(state.doc.defaultView.visualViewport.listeners.get('resize').size, 0);
	state.toolbar.onunload();
});

test('mobile Y selections expose one options button beside their native aggregation control', () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const menuCount = Menu.instances.length;
	for (const row of selectedRows(panel)) {
		assert.equal(row.classList.contains('is-compact'), true);
		assert.equal(row.querySelector('.bases-chart-property-edit'), null);
		assert.deepEqual(row.querySelectorAll('button'), [row.querySelector('.bases-chart-property-more')]);
		assert.equal(row.querySelector('.bases-chart-property-more').dataset.icon, 'ellipsis');
		assert.equal(row.querySelector('.bases-chart-property-more').getAttribute('aria-haspopup'), 'menu');
		assert.equal(row.querySelector('select').classList.contains('dropdown'), true);
	}
	const aggregate = selectedRows(panel)[0].querySelector('select');
	aggregate.value = 'Max';
	aggregate.dispatch('change');
	assert.equal(state.settings.get('aggregate:note.hours'), 'Max');
	assert.equal(state.panel(), panel);
	assert.equal(Menu.instances.length, menuCount, 'aggregation does not require the options menu');
	state.toolbar.onunload();
});

for (const preference of [false, true]) test(`mobile Y options inherit ${preference ? 'native' : 'DOM'} menus and preserve selection after actions`, () => {
	Menu.preference = preference;
	const state = harness('formula.bucket', { mobile: true });
	try {
		state.toolbar.openAxis('y');
		const panel = state.panel();
		let menu = propertyMenu(panel, 'note.hours');
		assert.deepEqual(menu.overrides, []);
		assert.equal(menu.useNativeMenu, preference);
		assert.equal(menu.parent, panel);
		assert.equal(menu.doc, state.doc);
		assert.deepEqual(menu.items.map(item => [item.title, Boolean(item.disabled)]), [
			['Edit property', false], ['Move up', true], ['Move down', false], ['Remove', false],
		]);
		menu.hide();
		assert.equal(state.doc.activeElement, selectedRows(panel)[0].querySelector('.bases-chart-property-more'));
		assert.equal(state.panel(), panel, 'cancelling the child menu leaves its parent open');
		menu = propertyMenu(panel, 'note.hours');
		const move = menu.items.find(item => item.title === 'Move down');
		if (preference) move.callback();
		else {
			move.element.dispatch('pointerdown');
			move.element.focus();
			assert.equal(state.panel(), panel, 'the official menu belongs to its parent sheet');
			move.element.dispatch('click');
		}
		assert.equal(menu.hidden, true);
		assert.deepEqual(state.settings.get('y'), ['note.score', 'note.hours']);
		assert.equal(state.settings.get('aggregate:note.hours'), 'Sum');
		const moved = selectedRows(panel)[1].querySelector('.bases-chart-property-more');
		assert.equal(state.doc.activeElement, moved, 'reordering restores focus to the same property');
		menu = propertyMenu(panel, 'note.hours');
		assert.equal(menu.items.find(item => item.title === 'Move down').disabled, true);
		menu.items.find(item => item.title === 'Remove').callback();
		assert.deepEqual(state.settings.get('y'), ['note.score']);
		assert.equal(state.panel(), panel);
		assert.equal(state.doc.activeElement, panel, 'removal does not summon the keyboard');
		assert.equal(Modal.instances.at(-1).titleEl.querySelector('.bases-chart-selection-count').textContent, '1');
		assert.ok(candidates(panel).some(row => row.dataset.property === 'note.hours'));
	} finally {
		state.toolbar.onunload();
		Menu.preference = false;
	}
});

for (const [id, title] of [['note.hours', 'Edit property'], ['formula.ratio', 'Edit formula']]) test(`mobile Y ${title} hands off the selected property through the existing native editor`, () => {
	const state = harness('formula.bucket', { mobile: true });
	state.settings.set('y', [id]);
	state.toolbar.openAxis('y');
	const modal = Modal.instances.at(-1);
	const menu = propertyMenu(state.panel(), id);
	menu.items.find(item => item.title === title).element.dispatch('click');
	assert.equal(menu.hidden, true);
	assert.equal(modal.opened, false);
	assert.equal(state.panel(), null);
	assert.deepEqual(state.formulaCalls, [{ anchor: state.button('y'), axis: 'y', propertyId: id }]);
	assert.deepEqual(state.writes, []);
	state.toolbar.openAxis('y'); // Same path used by the native editor's back callback.
	assert.deepEqual(selectedRows(state.panel()).map(row => row.dataset.property), [id]);
	state.toolbar.onunload();
});

test('mobile Y options omit unavailable editing and disable both moves for the sole selection', () => {
	const state = harness('formula.bucket', { mobile: true, formulaEditor: false });
	state.settings.set('y', ['note.hours']);
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const menu = propertyMenu(panel, 'note.hours');
	assert.deepEqual(menu.items.map(item => item.title), ['Move up', 'Move down', 'Remove']);
	for (const title of ['Move up', 'Move down']) {
		const item = menu.items.find(item => item.title === title);
		assert.equal(item.disabled, true);
		item.element.dispatch('click');
	}
	assert.deepEqual(state.writes, []);
	assert.equal(menu.hidden, false);
	menu.items.find(item => item.title === 'Remove').element.dispatch('click');
	assert.deepEqual(state.settings.get('y'), []);
	assert.equal(selectedRows(panel).length, 0);
	assert.equal(state.doc.activeElement, panel);
	state.toolbar.onunload();
});

test('mobile Y child menu cancellation restores focus and Escape dismisses only one layer', () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const trigger = selectedRows(panel)[0].querySelector('.bases-chart-property-more');
	trigger.dispatch('keydown', { key: 'ArrowDown' });
	const menu = Menu.instances.at(-1);
	assert.equal(trigger.getAttribute('aria-expanded'), 'true');
	menu.items[0].element.focus();
	menu.hide();
	assert.equal(state.doc.activeElement, trigger);
	assert.equal(trigger.getAttribute('aria-expanded'), 'false');
	trigger.dispatch('click');
	const escape = eventFor(trigger, { type: 'keydown', key: 'Escape' });
	state.doc.defaultView.emit('keydown', escape, true);
	Menu.instances.at(-1).hide(); // The host keymap may close the menu before ours.
	state.doc.emit('keydown', escape);
	assert.equal(escape.defaultPrevented, true);
	assert.equal(state.panel(), panel);
	assert.equal(state.doc.activeElement, trigger);
	trigger.dispatch('keydown', { key: 'Escape' });
	assert.equal(state.panel(), null);
	assert.equal(state.doc.activeElement, state.button('y'));
	state.toolbar.onunload();
});

test('mobile Y options switch between rows and toggle closed without dismissing the sheet', () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const first = propertyMenu(panel, 'note.hours');
	const second = propertyMenu(panel, 'note.score');
	assert.equal(first.hidden, true);
	assert.notEqual(second, first);
	assert.equal(second.hidden, false);
	assert.equal(selectedRows(panel)[0].querySelector('.bases-chart-property-more').getAttribute('aria-expanded'), 'false');
	assert.equal(selectedRows(panel)[1].querySelector('.bases-chart-property-more').getAttribute('aria-expanded'), 'true');
	propertyMenu(panel, 'note.score');
	assert.equal(second.hidden, true);
	assert.equal(state.panel(), panel);
	assert.equal(state.doc.activeElement, selectedRows(panel)[1].querySelector('.bases-chart-property-more'));
	state.toolbar.onunload();
});

for (const close of ['native-close', 'back', 'resize', 'rerender', 'unload']) test(`mobile Y ${close} cleans up its options menu`, () => {
	const state = harness('formula.bucket', { mobile: true });
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const trigger = selectedRows(panel)[0].querySelector('.bases-chart-property-more');
	const menu = propertyMenu(panel, 'note.hours');
	if (close === 'native-close') Modal.instances.at(-1).closeButton.dispatch('click');
	else if (close === 'back') Modal.instances.at(-1).onHistoryBack();
	else if (close === 'resize') state.doc.defaultView.visualViewport.emit('resize', {});
	else if (close === 'rerender') searchInput(panel).dispatch('input');
	else state.toolbar.onunload();
	assert.equal(menu.hidden, true);
	assert.equal(trigger.getAttribute('aria-expanded'), 'false');
	assert.equal(state.panel(), ['resize', 'rerender'].includes(close) ? panel : null);
	state.toolbar.onunload();
	for (const event of ['pointerdown', 'keydown', 'focusin']) assert.equal(state.doc.listeners.get(event)?.size ?? 0, 0);
	assert.equal(state.doc.defaultView.visualViewport.listeners.get('resize').size, 0);
});

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
		const selectedActions = selectedRows(panel)[0].querySelectorAll('button');
		const editLabels = { 'file.folder': 'Edit property: Folder', 'note.status': 'Edit property: Status', 'formula.bucket': 'Edit formula: Bucket' };
		assert.deepEqual(selectedActions.map(button => button.getAttribute('aria-label')), [editLabels[x]]);
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

test('a late aggregation update refreshes the open Y control without replacing DOM or focus', () => {
	const state = harness();
	state.settings.set('y', ['formula.ratio']);
	state.toolbar.openAxis('y');
	const panel = state.panel();
	const row = selectedRows(panel)[0];
	const select = row.querySelector('select');
	assert.equal(select.value, 'Sum');
	select.focus();
	state.settings.set('aggregate:formula.ratio', 'Count');
	state.toolbar.update();
	assert.equal(state.panel(), panel);
	assert.equal(selectedRows(panel)[0], row);
	assert.equal(row.querySelector('select'), select);
	assert.equal(select.value, 'Count');
	assert.equal(state.doc.activeElement, select);
	assert.deepEqual(state.writes, []);
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

test('date grouping is shown only for an eligible X property, never in Y', () => {
	for (const date of [false, true]) {
		const state = harness(date ? 'note.completed at' : 'note.status', { date, grouping: 'month' });
		state.toolbar.openAxis('x');
		const grouping = state.panel().querySelector('.bases-chart-date-grouping');
		assert.equal(Boolean(grouping), date);
		if (grouping) {
			assert.equal(grouping.querySelector('select'), null, 'date grouping must not open an OS select popup');
			const dropdown = grouping.querySelector('button');
			assert.equal(dropdown.getAttribute('aria-label'), 'Date grouping');
			assert.equal(dropdown.getAttribute('aria-haspopup'), 'menu');
			assert.equal(dropdown.textContent, 'Month');
			dropdown.dispatch('click');
			const menu = Menu.instances.at(-1);
			assert.deepEqual(menu.overrides, [], 'the host must choose native or DOM rendering');
			assert.equal(menu.parent, state.panel());
			assert.equal(menu.doc, state.doc);
			assert.deepEqual(menu.position, { x: 500, y: 80, width: 220, overlap: true, left: true });
			assert.deepEqual(menu.items.map(item => [item.title, item.checked]), [
				['Exact time', false], ['Day', false], ['Week', false], ['Month', true], ['Year', false],
			]);
			assert.equal(selectedRows(state.panel())[0].querySelector('.bases-chart-property-icon').dataset.icon, 'calendar-days');
		}
		state.toolbar.openAxis('y');
		assert.equal(state.panel().querySelector('.bases-chart-date-grouping'), null);
		state.toolbar.onunload();
	}
});

for (const preference of [false, true]) test(`date grouping inherits ${preference ? 'native' : 'DOM'} menus and handles selection and cancellation`, () => {
	Menu.preference = preference;
	const state = harness('note.completed at', { date: true });
	try {
		state.toolbar.openAxis('x');
		const panel = state.panel();
		const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
		dropdown.dispatch('click');
		const menu = Menu.instances.at(-1);
		assert.deepEqual(menu.overrides, []);
		assert.equal(menu.useNativeMenu, preference);
		assert.equal(Boolean(menu.element), !preference, 'OS menus have no DOM menu element');
		assert.equal(menu.doc, state.doc, 'the host must receive the owning popout document');
		menu.items.find(item => item.title === 'Day').callback();
		menu.hide();
		assert.deepEqual(state.writes, [{ key: 'x-date-grouping', value: { property: 'note.completed at', unit: 'day' } }]);
		assert.equal(state.panel(), panel);
		assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
		assert.equal(state.doc.activeElement, dropdown);
		dropdown.dispatch('click');
		const reopened = Menu.instances.at(-1);
		assert.deepEqual(reopened.items.filter(item => item.checked).map(item => item.title), ['Day']);
		reopened.hide(); // Native cancellation can arrive without a DOM keyboard event.
		assert.equal(state.writes.length, 1);
		assert.equal(state.panel(), panel);
		assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
		dropdown.dispatch('click');
		state.toolbar.onunload();
		assert.equal(Menu.instances.at(-1).hidden, true);
		assert.equal(state.panel(), null);
	} finally {
		state.toolbar.onunload();
		Menu.preference = false;
	}
});

test('choosing Day persists the property-bound grouping once and refreshes the X summary', () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
	assert.equal(dropdown.textContent, 'Exact time');
	dropdown.dispatch('click');
	const menu = Menu.instances.at(-1);
	const day = menu.items.find(item => item.title === 'Day').element;
	day.dispatch('pointerdown');
	day.focus();
	assert.equal(state.panel(), panel, 'pointer and focus inside the DOM menu must not close its parent');
	day.dispatch('click');
	assert.deepEqual(state.writes, [{ key: 'x-date-grouping', value: { property: 'note.completed at', unit: 'day' } }]);
	assert.equal(state.updateCount, 1);
	assert.equal(state.button('x').querySelector('.bases-chart-axis-summary').textContent, 'Completed at · Day');
	assert.equal(state.button('x').getAttribute('aria-label'), 'X axis: Completed at · Day');
	assert.equal(state.panel(), panel, 'date grouping edits leave the picker open');
	assert.equal(dropdown.textContent, 'Day');
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	assert.equal(state.doc.activeElement, dropdown);
	assert.equal(menu.hidden, true);
	dropdown.dispatch('click');
	assert.deepEqual(Menu.instances.at(-1).items.filter(item => item.checked).map(item => item.title), ['Day']);
	state.toolbar.onunload();
});

test('date menu Escape closes the child first and then the axis panel', () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
	const opening = dropdown.dispatch('keydown', { key: 'ArrowDown' });
	assert.equal(opening.defaultPrevented, true);
	assert.equal(dropdown.getAttribute('aria-expanded'), 'true');
	const menu = Menu.instances.at(-1);
	assert.equal(dropdown.dispatch('keydown', { key: 'ArrowDown' }).defaultPrevented, false, 'an open menu owns arrow-key navigation');
	dropdown.dispatch('keydown', { key: 'Escape' });
	assert.equal(menu.hidden, true);
	assert.equal(state.panel(), panel);
	assert.equal(state.doc.activeElement, dropdown);
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	dropdown.dispatch('keydown', { key: 'Escape' });
	assert.equal(state.panel(), null);
	assert.equal(state.doc.activeElement, state.button('x'));
	state.toolbar.onunload();
});

test('native keymap hiding the date menu before parent key handling consumes only the same Escape', async () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	const first = eventFor(dropdown, { type: 'keydown', key: 'Escape' });
	state.doc.defaultView.emit('keydown', first, true);
	Menu.instances.at(-1).hide();
	await Promise.resolve(); // Native event listeners can run a microtask checkpoint between phases.
	state.doc.emit('keydown', first);
	assert.equal(first.defaultPrevented, true);
	assert.equal(state.panel(), panel);
	assert.equal(state.doc.activeElement, dropdown);
	dropdown.dispatch('keydown', { key: 'Escape' });
	assert.equal(state.panel(), null);
	assert.equal(state.doc.activeElement, state.button('x'));
	state.toolbar.onunload();
});

for (const preference of [false, true]) test(`${preference ? 'native' : 'DOM'} menu cancellation survives an earlier document keymap listener`, () => {
	Menu.preference = preference;
	const state = harness('note.completed at', { date: true });
	// The host keymap is already registered when the plugin opens its panel.
	state.doc.addEventListener('keydown', event => {
		if (event.key === 'Escape') Menu.instances.at(-1)?.hide();
	}, true);
	try {
		state.toolbar.openAxis('x');
		const panel = state.panel();
		const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
		dropdown.dispatch('click');
		const menu = Menu.instances.at(-1);
		const first = dropdown.dispatch('keydown', { key: 'Escape' });
		assert.equal(menu.hidden, true);
		assert.equal(first.defaultPrevented, true);
		assert.equal(state.panel(), panel, 'the host may hide the child, but the same Escape cannot close its parent');
		assert.equal(state.doc.activeElement, dropdown);
		assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
		dropdown.dispatch('keydown', { key: 'Escape' });
		assert.equal(state.panel(), null);
		assert.equal(state.doc.defaultView.listeners.get('keydown').size, 0, 'the owning-window capture listener is removed with its panel');
	} finally {
		state.toolbar.onunload();
		Menu.preference = false;
	}
});

test('native date menu dismissal never swallows an unrelated later Escape', async () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const dropdown = state.panel().querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	Menu.instances.at(-1).hide();
	await Promise.resolve();
	dropdown.dispatch('keydown', { key: 'Escape' });
	assert.equal(state.panel(), null);
	state.toolbar.onunload();
});

test('one outside click closes both the date menu and axis panel', () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const dropdown = state.panel().querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	const menu = Menu.instances.at(-1);
	menu.background.dispatch('pointerdown');
	assert.equal(menu.hidden, true);
	assert.equal(state.panel(), null);
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	assert.equal(state.doc.listeners.get('pointerdown').size, 0);
	assert.equal(state.doc.listeners.get('focusin').size, 0);
	state.toolbar.onunload();
});

test('toggling or native hiding resets date menu state without closing the picker', () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	const first = Menu.instances.at(-1);
	dropdown.dispatch('click');
	assert.equal(first.hidden, true);
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	dropdown.dispatch('click');
	Menu.instances.at(-1).hide();
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	dropdown.dispatch('keydown', { key: 'Escape', defaultPrevented: true });
	assert.equal(state.panel(), panel, 'a native-handled Escape must not also dismiss the parent');
	state.toolbar.onunload();
});

for (const close of ['resize', 'unload', 'header', 'rerender']) test(`${close} cleans up the open date menu`, () => {
	const state = harness('note.completed at', { date: true });
	state.toolbar.openAxis('x');
	const panel = state.panel();
	const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
	dropdown.dispatch('click');
	const menu = Menu.instances.at(-1);
	if (close === 'resize') state.doc.defaultView.emit('resize', {});
	else if (close === 'unload') state.toolbar.onunload();
	else if (close === 'header') action(panel.querySelector('.bases-chart-panel-header'), 'Close').dispatch('click');
	else searchInput(panel).dispatch('input');
	assert.equal(menu.hidden, true);
	assert.equal(state.doc.body.querySelector('.menu'), null);
	assert.equal(dropdown.getAttribute('aria-expanded'), 'false');
	assert.equal(state.panel(), close === 'rerender' ? panel : null);
	state.toolbar.onunload();
	assert.equal(state.doc.defaultView.listeners.get('keydown').size, 0);
});

for (const axis of ['x', 'y']) test(`${axis.toUpperCase()} keeps Add formula outside search results and delegates to the native editor`, () => {
	const state = harness();
	state.toolbar.openAxis(axis);
	const panel = state.panel();
	const footer = panel.querySelector('.bases-chart-panel-footer');
	const results = panel.querySelector('.bases-chart-property-results');
	const button = footer.querySelector('.bases-chart-add-formula');
	assert.equal(footer.parentElement, panel);
	assert.ok(panel.children.indexOf(footer) > panel.children.indexOf(results));
	const search = searchInput(panel);
	search.value = 'no-matching-property';
	search.dispatch('input');
	assert.equal(candidates(panel).length, 0);
	assert.equal(panel.querySelector('.bases-chart-add-formula'), button, 'search must preserve the formula action');
	assert.equal(button.disabled, false);
	button.dispatch('click');
	assert.deepEqual(state.formulaCalls, [{ anchor: state.button(axis), axis, propertyId: undefined }]);
	assert.equal(state.button(axis).getAttribute('aria-expanded'), 'false');
	assert.deepEqual(state.writes, [], 'opening the editor should not mutate a property');
	state.toolbar.onunload();
});

test('selected X and Y formulas expose edit actions with the correct property and toolbar anchor', () => {
	const state = harness();
	state.toolbar.openAxis('x');
	action(selectedRows(state.panel())[0], 'Edit formula: Bucket').dispatch('click');
	assert.deepEqual(state.formulaCalls, [{ anchor: state.button('x'), axis: 'x', propertyId: 'formula.bucket' }]);
	state.settings.set('y', ['note.hours', 'formula.ratio']);
	state.toolbar.openAxis('y');
	const ratio = selectedRows(state.panel()).find(row => row.dataset.property === 'formula.ratio');
	action(ratio, 'Edit formula: Ratio').dispatch('click');
	assert.deepEqual(state.formulaCalls[1], { anchor: state.button('y'), axis: 'y', propertyId: 'formula.ratio' });
	assert.deepEqual(state.writes, []);
	state.toolbar.onunload();
});

test('unavailable native formula editing disables Add formula and omits selected edit actions', () => {
	const state = harness('formula.bucket', { formulaEditor: false });
	state.settings.set('y', ['formula.ratio']);
	for (const axis of ['x', 'y']) {
		state.toolbar.openAxis(axis);
		const panel = state.panel();
		const button = panel.querySelector('.bases-chart-add-formula');
		assert.equal(button.disabled, true);
		button.dispatch('click');
		assert.equal(state.panel(), panel);
		assert.ok(selectedRows(panel).every(row => row.querySelectorAll('button').every(action => !action.getAttribute('aria-label').startsWith('Edit'))));
		assert.equal(panel.querySelectorAll('.bases-chart-property-edit').length, 0);
	}
	assert.deepEqual(state.formulaCalls, []);
	state.toolbar.onunload();
});

for (const axis of ['x', 'y']) {
	for (const [id, label] of [
		['file.folder', 'Edit property: Folder'],
		['note.status', 'Edit property: Status'],
		['formula.ratio', 'Edit formula: Ratio'],
	]) test(`${axis.toUpperCase()} candidate ${id} opens native editing without selecting or adding the property`, () => {
		const state = harness();
		state.toolbar.openAxis(axis);
		const primary = candidates(state.panel()).find(choice => choice.dataset.property === id);
		const row = primary.parentElement;
		const edit = action(row, label);
		assert.equal(row.tag, 'div');
		assert.equal(edit.parentElement, row, 'selection and editing must be sibling controls');
		assert.equal(primary.querySelectorAll('button').length, 0, 'do not nest interactive controls');
		assert.equal(edit.dataset.icon, 'chevron-right');
		assert.equal(edit.getAttribute('aria-haspopup'), 'dialog');
		edit.dispatch('click');
		assert.deepEqual(state.formulaCalls, [{ anchor: state.button(axis), axis, propertyId: id }]);
		assert.equal(state.settings.get('x'), 'formula.bucket');
		assert.deepEqual(state.settings.get('y'), ['note.hours', 'note.score']);
		assert.deepEqual(state.writes, []);
		assert.equal(state.updateCount, 0);
		state.toolbar.onunload();
	});
}

for (const axis of ['x', 'y']) {
	for (const [id, label] of [
		['file.folder', 'Edit property: Folder'],
		['note.status', 'Edit property: Status'],
	]) test(`selected ${axis.toUpperCase()} ${id} exposes native property editing while preserving selection`, () => {
		const state = harness(id);
		if (axis === 'y') state.settings.set('y', [id]);
		state.toolbar.openAxis(axis);
		const row = selectedRows(state.panel())[0];
		if (axis === 'x') assert.equal(row.querySelector('.bases-chart-property-check').getAttribute('aria-label'), 'Selected');
		action(row, label).dispatch('click');
		assert.deepEqual(state.formulaCalls, [{ anchor: state.button(axis), axis, propertyId: id }]);
		assert.deepEqual(state.writes, []);
		assert.equal(state.updateCount, 0);
		state.toolbar.onunload();
	});
}

test('candidate keyboard navigation skips editing controls while leaving their native Tab order intact', () => {
	const state = harness();
	state.toolbar.openAxis('x');
	const options = candidates(state.panel());
	const first = options[0];
	const edit = first.parentElement.querySelector('.bases-chart-property-edit');
	assert.deepEqual(first.parentElement.querySelectorAll('button'), [first, edit]);
	assert.equal(edit.getAttribute('tabindex'), null);
	first.focus();
	assert.equal(first.dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
	first.dispatch('keydown', { key: 'ArrowDown' });
	assert.equal(state.doc.activeElement, options[1]);
	edit.focus();
	assert.equal(edit.dispatch('keydown', { key: 'ArrowDown' }).defaultPrevented, false);
	assert.equal(state.doc.activeElement, edit);
	assert.equal(edit.dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
	state.toolbar.onunload();
});

test('reordering a Y formula preserves move-button focus despite its extra edit action', () => {
	const state = harness();
	state.settings.set('y', ['note.hours', 'note.score', 'formula.ratio']);
	state.toolbar.openAxis('y');
	const panel = state.panel();
	let ratio = selectedRows(panel).find(row => row.dataset.property === 'formula.ratio');
	action(ratio, 'Move Ratio up').dispatch('click');
	assert.deepEqual(state.settings.get('y'), ['note.hours', 'formula.ratio', 'note.score']);
	ratio = selectedRows(panel).find(row => row.dataset.property === 'formula.ratio');
	assert.equal(state.doc.activeElement, action(ratio, 'Move Ratio up'));
	assert.deepEqual(state.formulaCalls, []);
	state.toolbar.onunload();
});

for (const mobile of [false, true]) test(`missing-date native toggle persists in the ${mobile ? 'mobile' : 'desktop'} X picker without closing it`, () => {
	const state = harness('note.completed at', { date: true, grouping: 'day', mobile });
	try {
		state.toolbar.openAxis('x');
		const panel = state.panel();
		const row = panel.querySelector('.bases-chart-date-gaps');
		const toggle = row.querySelector('.checkbox-container');
		assert.equal(row.querySelector('span').textContent, 'Show missing dates');
		assert.equal(toggle.getAttribute('aria-label'), 'Show missing dates');
		assert.equal(toggle.getAttribute('aria-checked'), 'false');
		assert.equal(toggle.disabled, false);
		toggle.dispatch('click');
		assert.deepEqual(state.writes, [{ key: 'x-date-gaps', value: { property: 'note.completed at', enabled: true } }]);
		assert.equal(toggle.getAttribute('aria-checked'), 'true');
		assert.equal(state.panel(), panel);
		assert.equal(state.updateCount, 1);
		state.toolbar.openAxis('x');
		state.toolbar.openAxis('x');
		assert.equal(state.panel().querySelector('.bases-chart-date-gaps').querySelector('.checkbox-container').getAttribute('aria-checked'), 'true');
	} finally { state.toolbar.onunload(); Platform.isMobile = false; Platform.isPhone = false; }
});

test('missing-date toggle follows grouping changes without changing Exact time or forgetting its saved choice', () => {
	const state = harness('note.completed at', { date: true });
	try {
		state.toolbar.openAxis('x');
		const panel = state.panel();
		const toggle = panel.querySelector('.bases-chart-date-gaps').querySelector('.checkbox-container');
		const dropdown = panel.querySelector('.bases-chart-date-grouping').querySelector('button');
		assert.equal(toggle.disabled, true);
		assert.match(toggle.getAttribute('aria-label'), /Show missing dates. Choose Day, Week, Month, or Year/);
		toggle.dispatch('click');
		assert.deepEqual(state.writes, []);
		const selectGrouping = title => {
			dropdown.dispatch('click');
			const menu = Menu.instances.at(-1);
			menu.items.find(item => item.title === title).callback();
			menu.hide();
		};
		selectGrouping('Day');
		assert.equal(toggle.disabled, false);
		toggle.dispatch('click');
		selectGrouping('Exact time');
		assert.equal(toggle.disabled, true);
		assert.equal(toggle.getAttribute('aria-checked'), 'true');
		selectGrouping('Week');
		assert.equal(toggle.disabled, false);
		assert.equal(toggle.getAttribute('aria-checked'), 'true');
		assert.equal(state.settings.get('x-date-grouping').unit, 'week');
	} finally { state.toolbar.onunload(); }
});

test('missing-date control is limited to date X axes in Cartesian views', () => {
	for (const type of ['chart-bar', 'chart-line', 'chart-area', 'chart-scatter', 'chart-pie', 'chart-radar']) {
		for (const date of [false, true]) {
			const state = harness(date ? 'note.completed at' : 'note.status', { type, date, grouping: 'day' });
			state.toolbar.openAxis('x');
			assert.equal(Boolean(state.panel().querySelector('.bases-chart-date-gaps')), date && !['chart-pie', 'chart-radar'].includes(type));
			state.toolbar.openAxis('y');
			assert.equal(state.panel().querySelector('.bases-chart-date-gaps'), null);
			state.toolbar.onunload();
		}
	}
});
