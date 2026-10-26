import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
			export { GroupColorCustomModal } from './src/ui/groupColorsModal.ts';
			export { resolveGroupColorChoice } from './src/dataCharts/groupColors.ts';
			export { Platform } from 'obsidian';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'group-color-native-controls',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, () => ({ contents: `
				export const Platform = { isMobile: false };
				export class Modal {
					constructor(app) {
						this.app = app;
						this.modalEl = app.doc.body.createDiv({ cls: 'modal' });
						this.modalEl.remove();
						this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
					}
					setTitle(value) { this.title = value; return this; }
					open() {
						if (this.isOpen) return;
						this.isOpen = true;
						this.app.doc.body.insertBefore(this.modalEl, null);
						this.onOpen();
						// Native Modal's keyboard autofocus runs after onOpen.
						if (!Platform.isMobile) this.modalEl.querySelector('input')?.focus();
					}
					close() {
						if (!this.isOpen) return;
						this.isOpen = false; this.onClose(); this.modalEl.remove();
					}
				}
				export class ButtonComponent {
					constructor(parent) { this.buttonEl = parent.createEl('button'); }
					setButtonText(value) { this.buttonEl.setText(value); return this; }
					setCta() { this.buttonEl.addClass('mod-cta'); return this; }
					setDisabled(value) { this.buttonEl.disabled = value; return this; }
					onClick(callback) { this.buttonEl.addEventListener('click', callback); return this; }
				}
				export class TextComponent {
					constructor(parent) { this.inputEl = parent.createEl('input', { type: 'text' }); }
					setValue(value) { this.inputEl.value = value; return this; }
					setPlaceholder(value) { this.inputEl.placeholder = value; return this; }
					onChange(callback) { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
				}
				export class ColorComponent {
					constructor(parent) {
						this.color = parent.createEl('input', { type: 'color' });
						this.color.value = '#000000';
						this.color.addEventListener('change', () => this.callback?.(this.getValue()));
					}
					getValue() { return this.color.value; }
					setValue(value) {
						// Native programmatic updates invoke onChange; the browser
						// normalizes hex after comparison with the supplied value.
						if (this.color.value !== value) {
							this.color.value = value;
							this.callback?.(this.getValue());
						}
						return this;
					}
					onChange(callback) { this.callback = callback; return this; }
				}
			` }));
		},
	}],
});
const { GroupColorCustomModal, resolveGroupColorChoice, Platform } = await import(
	`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`,
);

class Element {
	children = [];
	parentElement = null;
	attributes = new Map();
	listeners = new Map();
	_value = '';
	disabled = false;
	constructor(doc, tag = 'div', options = {}) {
		this.ownerDocument = doc;
		this.tag = tag;
		this.type = options.type;
		this.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		this.textContent = options.text ?? '';
	}
	get isConnected() {
		for (let node = this; node; node = node.parentElement) if (node === this.ownerDocument.body) return true;
		return false;
	}
	get value() { return this._value; }
	set value(value) {
		this._value = this.type === 'color' ? (/^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000') : value;
	}
	createEl(tag, options) {
		const child = new Element(this.ownerDocument, tag, options);
		this.insertBefore(child, null);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	insertBefore(child, before) {
		child.remove(); child.parentElement = this;
		this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
	}
	addClass(value) { this.classes.add(value); }
	setText(value) { this.textContent = value; }
	setAttribute(name, value) { this.attributes.set(name, value); }
	getAttribute(name) { return this.attributes.get(name) ?? null; }
	removeAttribute(name) { this.attributes.delete(name); }
	addEventListener(name, callback) {
		if (!this.listeners.has(name)) this.listeners.set(name, []);
		this.listeners.get(name).push(callback);
	}
	dispatch(name, extra = {}) {
		if (this.disabled && name === 'click') return;
		const event = { preventDefault() {}, ...extra };
		for (const callback of this.listeners.get(name) ?? []) callback(event);
	}
	focus() { this.ownerDocument.activeElement = this; this.ownerDocument.focusHistory.push(this); }
	select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
	empty() { for (const child of this.children) child.parentElement = null; this.children = []; }
	remove() {
		if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
		this.parentElement = null;
	}
	matches(selector) {
		if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
		if (selector.startsWith('input[type=')) return this.tag === 'input' && this.type === selector.split('"')[1];
		return this.tag === selector;
	}
	querySelectorAll(selector) {
		return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
	}
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
class Events {
	refs = new Set();
	on(name, callback) { const ref = { name, callback }; this.refs.add(ref); return ref; }
	offref(ref) { this.refs.delete(ref); }
	trigger(name) { for (const ref of [...this.refs]) if (ref.name === name) ref.callback(); }
}
const group = (name, choice = null) => ({ key: JSON.stringify(['String', name]), name, automaticColor: '#6688AA', choice });

function harness({ groups = [group('Done'), group('In progress')], key = groups[0]?.key, mobile = false } = {}) {
	Platform.isMobile = mobile;
	const doc = { focusHistory: [] };
	doc.body = new Element(doc);
	const writes = [];
	const overrides = new Map(groups.filter(entry => entry.choice).map(entry => [entry.key, entry.choice]));
	const host = {
		app: { doc }, events: new Events(), groups, dark: false,
		getGroupColorEntries() {
			return this.groups.map((entry, index) => {
				const choice = overrides.get(entry.key) ?? null;
				return { ...entry, choice, groupIndex: index, color: resolveGroupColorChoice(choice, this.dark) ?? entry.automaticColor };
			});
		},
		setGroupColor(key, choice) {
			assert.ok(writes.length < 5, 'Color updates must not loop');
			writes.push({ key, choice }); overrides.set(key, choice);
			this.events.trigger('data-updated');
		},
		resetGroupColors() { assert.fail('Custom color must never reset other groups'); },
		hasGroupColors() { return overrides.size > 0; },
	};
	const modal = new GroupColorCustomModal(host, key);
	modal.open();
	const hex = modal.contentEl.querySelector('input[type="text"]');
	const picker = modal.contentEl.querySelector('input[type="color"]');
	const button = text => modal.contentEl.querySelectorAll('button').find(button => button.textContent === text);
	return { doc, modal, host, hex, picker, button, writes, overrides };
}

test('custom color opens one group only, initializes native controls, and never writes on open', () => {
	const groups = Array.from({ length: 20 }, (_, index) => group(`Group ${index}`, { type: 'custom', value: '#ABCDEF' }));
	const h = harness({ groups, key: groups[14].key });
	assert.equal(h.modal.title, 'Custom color');
	assert.equal(h.modal.contentEl.querySelector('.bases-chart-custom-color-group').textContent, 'Group 14');
	assert.equal(h.modal.contentEl.querySelectorAll('input').length, 2);
	assert.equal(h.modal.contentEl.querySelectorAll('button').length, 2);
	assert.equal(h.picker.value, '#abcdef');
	assert.equal(h.hex.value, '#ABCDEF');
	assert.equal(h.hex.getAttribute('aria-label'), 'Hex color for Group 14');
	assert.equal(h.picker.getAttribute('aria-label'), 'Custom color for Group 14');
	assert.deepEqual(h.writes, []);
	h.modal.close();
});

test('hex validation updates a local preview; Apply saves once and only to the selected group', () => {
	const h = harness();
	const apply = h.button('Apply');
	h.hex.value = '#12'; h.hex.dispatch('input');
	assert.equal(apply.disabled, true);
	assert.equal(h.hex.getAttribute('aria-invalid'), 'true');
	assert.equal(h.hex.getAttribute('aria-describedby'), h.modal.contentEl.querySelector('.bases-chart-custom-color-error').id);
	apply.dispatch('click');
	assert.deepEqual(h.writes, []);
	h.hex.value = '#aBc'; h.hex.dispatch('input');
	assert.equal(h.picker.value, '#aabbcc');
	assert.equal(apply.disabled, false);
	assert.equal(h.hex.getAttribute('aria-invalid'), 'false');
	assert.equal(h.hex.getAttribute('aria-describedby'), null);
	h.hex.dispatch('blur');
	assert.equal(h.hex.value, '#AABBCC');
	assert.deepEqual(h.writes, []);
	apply.dispatch('click');
	apply.dispatch('click');
	assert.deepEqual(h.writes, [{ key: group('Done').key, choice: { type: 'custom', value: '#AABBCC' } }]);
	assert.equal(h.modal.modalEl.isConnected, false);
	assert.equal(h.host.events.refs.size, 0);
});

test('Cancel and dismissal discard native picker and hex drafts without writing configuration', () => {
	for (const cancel of [true, false]) {
		const h = harness();
		for (const value of ['#A1B2C3', '#B4C5D6', '#C7D8E9']) {
			h.picker.value = value; h.picker.dispatch('change');
			assert.equal(h.hex.value, value);
		}
		h.hex.value = '#123456'; h.hex.dispatch('input');
		if (cancel) h.button('Cancel').dispatch('click'); else h.modal.close();
		assert.deepEqual(h.writes, []);
		assert.equal(h.overrides.size, 0);
		assert.equal(h.host.events.refs.size, 0);
	}
});

test('external updates preserve the local draft and native inputs while refreshing group labels', () => {
	const h = harness();
	h.hex.value = '#12'; h.hex.dispatch('input');
	h.overrides.set(group('Done').key, { type: 'custom', value: '#FEDCBA' });
	h.host.groups[0] = { ...h.host.groups[0], name: 'Complete' };
	h.host.dark = true;
	for (let index = 0; index < 3; index++) h.host.events.trigger('data-updated');
	assert.equal(h.hex.value, '#12');
	assert.equal(h.button('Apply').disabled, true);
	assert.equal(h.modal.contentEl.querySelector('input[type="color"]'), h.picker);
	assert.equal(h.modal.contentEl.querySelector('input[type="text"]'), h.hex);
	assert.equal(h.modal.contentEl.querySelector('.bases-chart-custom-color-group').textContent, 'Complete');
	assert.equal(h.picker.getAttribute('aria-label'), 'Custom color for Complete');
	assert.deepEqual(h.writes, []);
	h.picker.value = '#ABCDEF'; h.picker.dispatch('change');
	assert.equal(h.button('Apply').disabled, false);
	h.button('Apply').dispatch('click');
	assert.equal(h.writes[0].key, group('Done').key);
	assert.equal(h.writes[0].choice.value, '#ABCDEF');
});

test('a removed group closes the dialog and stale callbacks cannot write', () => {
	const h = harness();
	const apply = h.button('Apply');
	h.host.groups = [h.host.groups[1]];
	h.host.events.trigger('data-updated');
	assert.equal(h.modal.modalEl.isConnected, false);
	assert.equal(h.host.events.refs.size, 0);
	h.hex.value = '#ABCDEF'; h.hex.dispatch('input');
	h.picker.value = '#FEDCBA'; h.picker.dispatch('change');
	apply.dispatch('click');
	assert.deepEqual(h.writes, []);
	const missing = harness({ key: 'unknown' });
	assert.equal(missing.modal.modalEl.isConnected, false);
	assert.equal(missing.host.events.refs.size, 0);
});

test('post-open focus selects hex on desktop and keeps the phone keyboard closed', () => {
	for (const mobile of [false, true]) {
		const h = harness({ mobile });
		assert.equal(h.doc.activeElement, mobile ? h.button('Apply') : h.hex);
		if (mobile) assert.equal(h.doc.focusHistory.some(element => element.tag === 'input'), false);
		else assert.equal(h.hex.selectionEnd, h.hex.value.length);
		h.modal.open();
		assert.equal(h.host.events.refs.size, 1);
		h.modal.close();
	}
});

test('Enter applies a valid hex draft, but invalid input and composition do not save', () => {
	const h = harness();
	h.hex.value = 'invalid'; h.hex.dispatch('input');
	h.hex.dispatch('keydown', { key: 'Enter' });
	assert.deepEqual(h.writes, []);
	h.hex.value = '#123'; h.hex.dispatch('input');
	h.hex.dispatch('keydown', { key: 'Enter', isComposing: true });
	assert.deepEqual(h.writes, []);
	h.hex.dispatch('keydown', { key: 'Enter' });
	assert.deepEqual(h.writes, [{ key: group('Done').key, choice: { type: 'custom', value: '#112233' } }]);
});
