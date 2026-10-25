import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
	stdin: {
		contents: `
			export { ChartPalettePicker, isChartPaletteSelect } from './src/ui/chartPalettePicker.ts';
			export { CHART_PALETTES, getPaletteColors } from './src/ui/chartPalettes.ts';
		`,
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'palette-host-controls',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
				export function setIcon(element, icon) { element.dataset.icon = icon; }
				export class SearchComponent {
					constructor(parent) { this.inputEl = parent.createEl('input'); }
					setPlaceholder(value) { this.inputEl.placeholder = value; return this; }
					onChange(callback) { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
				}
			` }));
		},
	}],
});
const { ChartPalettePicker, isChartPaletteSelect, CHART_PALETTES, getPaletteColors } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);

class EventTargetFixture {
	listeners = new Map();
	addEventListener(name, callback) {
		if (!this.listeners.has(name)) this.listeners.set(name, new Set());
		this.listeners.get(name).add(callback);
	}
	removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
	emit(name, event) {
		for (const callback of [...(this.listeners.get(name) ?? [])]) {
			callback(event);
			if (event.immediateStopped) break;
		}
	}
}

function eventFor(target, extra = {}) {
	return {
		target, defaultPrevented: false, stopped: false, immediateStopped: false,
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.stopped = true; },
		stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; },
		composedPath() {
			const nodes = [];
			for (let node = target; node; node = node.parentElement) nodes.push(node);
			return [...nodes, target.ownerDocument];
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
	style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
	constructor(doc, tag = 'div', options = {}) {
		super();
		this.ownerDocument = doc;
		this.tag = tag;
		this.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		this.textContent = options.text ?? '';
		this.text = this.textContent;
		this.value = options.value ?? '';
		for (const [key, value] of Object.entries(options.attr ?? {})) this.setAttribute(key, value);
	}
	get win() { return this.ownerDocument.defaultView; }
	get isConnected() {
		for (let node = this; node; node = node.parentElement) if (node === this.ownerDocument.body) return true;
		return false;
	}
	get options() { return this.children.filter(child => child.tag === 'option'); }
	get classList() { return { contains: cls => this.classes.has(cls) }; }
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
	toggleClass(cls, enabled) { if (enabled) this.addClass(cls); else this.removeClass(cls); }
	setAttribute(key, value) { this.attributes.set(key, value); }
	getAttribute(key) { return this.attributes.get(key) ?? null; }
	removeAttribute(key) { this.attributes.delete(key); }
	getBoundingClientRect() { return { left: 60, right: 340, top: 180, bottom: 216, width: 280, height: 36 }; }
	after(child) {
		child.remove();
		child.parentElement = this.parentElement;
		this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, child);
	}
	empty() { for (const child of this.children) child.parentElement = null; this.children = []; }
	remove() {
		if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
		this.parentElement = null;
	}
	matches(selector) {
		if (selector.startsWith('.')) return selector.slice(1).split('.').every(cls => this.classes.has(cls));
		if (selector.startsWith('#')) return this.id === selector.slice(1);
		return this.tag === selector;
	}
	closest(selector) {
		for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
		return null;
	}
	querySelectorAll(selector) {
		return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
	}
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
	focus() { this.ownerDocument.activeElement = this; }
	scrollIntoView(options) { this.scrolledWith = options; }
	dispatchEvent(nativeEvent) {
		const event = eventFor(this, nativeEvent);
		for (let node = this; node && !event.stopped; node = nativeEvent.bubbles ? node.parentElement : null) node.emit(nativeEvent.type, event);
		if (nativeEvent.bubbles && !event.stopped) this.ownerDocument.emit(nativeEvent.type, event);
		return !event.defaultPrevented;
	}
	dispatch(name, extra = {}) { return this.dispatchEvent({ type: name, bubbles: true, ...extra }); }
	click() { this.dispatch('click'); }
}

function harness(dark = false) {
	const doc = new EventTargetFixture();
	const win = new EventTargetFixture();
	Object.assign(win, {
		innerWidth: 1000, innerHeight: 800,
		Event: class OwnerWindowEvent {
			constructor(type, options) { this.type = type; Object.assign(this, options); }
		},
	});
	doc.defaultView = win;
	doc.body = new Element(doc, 'body');
	if (dark) doc.body.addClass('theme-dark');
	win.createEl = (tag, options) => new Element(doc, tag, options);
	const nativeMenu = doc.body.createDiv({ cls: 'bases-toolbar-menu' });
	const form = nativeMenu.createDiv({ cls: 'view-config-menu' });
	const writes = [];
	const saved = new Map();
	const createSetting = (view, initial = 'auto') => {
		const row = form.createDiv({ cls: 'input-row' });
		const select = row.createEl('select', { cls: 'dropdown' });
		for (const palette of CHART_PALETTES) select.createEl('option', { value: palette.id, text: palette.name });
		select.value = initial;
		saved.set(view, initial);
		select.addEventListener('change', event => {
			assert.equal(event.target, select);
			writes.push({ view, value: select.value });
			saved.set(view, select.value);
		});
		return select;
	};
	return {
		doc, win, nativeMenu, form, writes, saved, createSetting,
		panel: () => nativeMenu.querySelector('.bases-chart-palette-popover'),
		rows: () => nativeMenu.querySelectorAll('.bases-chart-palette-option'),
		search: () => nativeMenu.querySelector('.bases-chart-palette-search').querySelector('input'),
		key(key) { const event = eventFor(this.search(), { key }); doc.emit('keydown', event); return event; },
	};
}

function assertNoPopupListeners(host) {
	for (const target of [host.doc, host.win]) for (const listeners of target.listeners.values()) assert.equal(listeners.size, 0);
}

function swatchColors(element) {
	return element.querySelectorAll('.bases-chart-palette-swatch').map(swatch => swatch.style.values.get('background-color'));
}

test('only the exact native palette setting is eligible; measuring and unrelated selects are excluded', () => {
	const host = harness();
	const select = host.createSetting('chart');
	assert.equal(isChartPaletteSelect(select), true);
	select.addClass('is-measuring');
	assert.equal(isChartPaletteSelect(select), false);
	select.removeClass('is-measuring');
	select.options[0].text = 'Different plugin setting';
	assert.equal(isChartPaletteSelect(select), false);
	select.options[0].text = CHART_PALETTES[0].name;
	select.options.at(-1).remove();
	assert.equal(isChartPaletteSelect(select), false);
	assert.equal(select.parentElement.children.length, 1, 'eligibility checking must not alter native controls');
	assert.deepEqual(host.writes, []);
});

test('selecting a palette saves through the configured native view even when another view is active', () => {
	const host = harness();
	const active = host.createSetting('active-view', 'blue');
	const configured = host.createSetting('configured-inactive-view', 'coastal');
	const picker = new ChartPalettePicker(configured);
	assert.equal(configured.classList.contains('bases-chart-palette-native'), true);
	assert.equal(active.parentElement.children.length, 1, 'the other view is untouched');
	picker.open();
	assert.equal(host.panel().parentElement, host.nativeMenu, 'the popup must stay within the native menu ownership tree');
	const selected = host.rows().filter(row => row.getAttribute('aria-selected') === 'true');
	assert.equal(selected.length, 1);
	assert.equal(host.rows()[0], selected[0]);
	assert.equal(selected[0].dataset.palette, 'coastal');
	assert.equal(selected[0].querySelector('.bases-chart-palette-check').dataset.icon, 'check');
	assert.ok(host.rows().every(row => swatchColors(row).length === 5));
	host.rows().find(row => row.dataset.palette === 'earth').click();
	assert.deepEqual(host.writes, [{ view: 'configured-inactive-view', value: 'earth' }]);
	assert.equal(host.saved.get('active-view'), 'blue');
	assert.equal(host.saved.get('configured-inactive-view'), 'earth');
	assert.equal(host.panel(), null);
	assert.equal(host.doc.activeElement, picker.button);
	assert.equal(picker.button.getAttribute('aria-label'), 'Color palette: Earth');
	assertNoPopupListeners(host);
	picker.destroy();
	assert.equal(configured.classList.contains('bases-chart-palette-native'), false);
	assert.equal(configured.parentElement.children.length, 1);
	configured.value = 'red';
	configured.dispatchEvent(new host.win.Event('change', { bubbles: true }));
	assert.equal(host.saved.get('configured-inactive-view'), 'red', 'destroy must preserve native saving behavior');
});

test('search and keyboard navigation preview choices without saving until Enter; Escape cancels', () => {
	const host = harness();
	const picker = new ChartPalettePicker(host.createSetting('chart', 'earth'));
	picker.open();
	const input = host.search();
	assert.equal(host.doc.activeElement, input);
	input.value = 'co'; input.dispatch('input');
	assert.deepEqual(host.rows().map(row => row.dataset.palette), ['colorful', 'coastal', 'gray']);
	host.key('ArrowDown');
	assert.equal(host.rows().find(row => row.classList.contains('is-selected')).dataset.palette, 'coastal');
	assert.deepEqual(host.writes, []);
	host.key('Enter');
	assert.deepEqual(host.writes, [{ view: 'chart', value: 'coastal' }]);
	picker.open();
	host.search().value = 'no such palette'; host.search().dispatch('input');
	assert.equal(host.rows().length, 0);
	assert.equal(host.panel().querySelector('.bases-chart-palette-empty').textContent, 'No matching palettes');
	host.key('Enter');
	assert.equal(host.writes.length, 1);
	const escape = host.key('Escape');
	assert.equal(escape.defaultPrevented, true);
	assert.equal(escape.immediateStopped, true);
	assert.equal(host.panel(), null);
	assert.equal(host.doc.activeElement, picker.button);
	assertNoPopupListeners(host);
	picker.destroy();
});

test('swatches use the owning window theme and refresh while preserving the current query and selection', () => {
	const light = harness();
	const dark = harness(true);
	const lightPicker = new ChartPalettePicker(light.createSetting('chart', 'coastal'));
	const darkPicker = new ChartPalettePicker(dark.createSetting('chart', 'coastal'));
	assert.equal(swatchColors(lightPicker.button)[0], getPaletteColors('coastal', false)[0]);
	assert.equal(swatchColors(darkPicker.button)[0], getPaletteColors('coastal', true)[0]);
	lightPicker.open();
	light.search().value = 'coast'; light.search().dispatch('input');
	light.doc.body.addClass('theme-dark');
	lightPicker.refresh();
	assert.equal(light.search().value, 'coast');
	assert.deepEqual(light.rows().map(row => row.dataset.palette), ['coastal']);
	assert.equal(light.rows()[0].getAttribute('aria-selected'), 'true');
	assert.equal(swatchColors(light.rows()[0])[0], getPaletteColors('coastal', true)[0]);
	assert.deepEqual(light.writes, []);
	lightPicker.destroy(); darkPicker.destroy();
	assertNoPopupListeners(light); assertNoPopupListeners(dark);
});

test('outside dismissal and native menu removal release popup listeners and restore the select', () => {
	const host = harness();
	const select = host.createSetting('chart');
	const picker = new ChartPalettePicker(select);
	picker.open();
	host.win.emit('scroll', eventFor(host.panel()));
	assert.ok(host.panel(), 'scrolling the palette list must not dismiss its own popup');
	host.doc.emit('pointerdown', eventFor(host.doc.body));
	assert.equal(host.panel(), null);
	assertNoPopupListeners(host);
	picker.open();
	host.nativeMenu.remove();
	picker.destroy();
	assert.equal(select.classList.contains('bases-chart-palette-native'), false);
	assert.equal(picker.button.isConnected, false);
	assert.equal(select.listeners.get('change').size, 1, 'only the original native handler remains');
	assertNoPopupListeners(host);
	picker.open();
	assert.equal(host.panel(), null, 'a detached native setting must never create an orphan popup');
});
