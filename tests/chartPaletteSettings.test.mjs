import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
	stdin: {
		contents: "export { ChartPaletteSettings } from './src/ui/chartPaletteSettings.ts';",
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
	},
	bundle: true, write: false, format: 'esm', platform: 'node',
	plugins: [{
		name: 'settings-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\/chartPalettePicker)$/ }, args => ({ path: args.path, namespace: 'host' }));
			builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'obsidian' ? `
				export class Component { registerEvent() {} }
			` : `
				export function isChartPaletteSelect(select) { return select.isPalette; }
				export class ChartPalettePicker {
					constructor(select) {
						this.select = select;
						select.enhancements++;
						select.ownerDocument.pickers.set(select, this);
						select.ownerDocument.popupListeners.add(this);
					}
					refresh() {}
					destroy() {
						this.select.destructions++;
						this.select.ownerDocument.popupListeners.delete(this);
					}
				}
			` }));
		},
	}],
});
const { ChartPaletteSettings } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);

class Element {
	nodeType = 1;
	children = [];
	parentElement = null;
	enhancements = 0;
	destructions = 0;
	constructor(doc, className = '') { this.ownerDocument = doc; this.className = className; }
	get isConnected() {
		return this === this.ownerDocument.body || !!this.parentElement?.isConnected;
	}
	matches(selector) { return selector === `.${this.className}`; }
	closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
	querySelector(selector) {
		for (const child of this.children) {
			const match = child.matches(selector) ? child : child.querySelector(selector);
			if (match) return match;
		}
		return null;
	}
	append(child) { this.children.push(child); child.parentElement = this; return child; }
	replaceChildren(...children) {
		const removedNodes = this.children;
		for (const child of removedNodes) child.parentElement = null;
		this.children = [];
		for (const child of children) this.append(child);
		return { target: this, addedNodes: children, removedNodes };
	}
}

function harness() {
	const doc = { pickers: new Map(), popupListeners: new Set() };
	const observers = [];
	doc.defaultView = {
		MutationObserver: class {
			constructor(callback) { this.callback = callback; observers.push(this); }
			observe() { this.connected = true; }
			disconnect() { this.connected = false; }
		},
	};
	doc.body = new Element(doc, 'body');
	const nativeMenu = doc.body.append(new Element(doc, 'bases-toolbar-menu'));
	const form = nativeMenu.append(new Element(doc, 'view-config-menu'));
	const selects = [];
	doc.querySelectorAll = () => selects.filter(select => select.isConnected && select.closest('.view-config-menu'));
	const createRow = () => {
		const row = new Element(doc, 'input-row');
		const select = row.append(new Element(doc, 'dropdown'));
		select.isPalette = true;
		selects.push(select);
		return { row, select };
	};
	const workspace = {
		containerEl: doc.body,
		onLayoutReady(callback) { callback(); },
		iterateAllLeaves() {},
		on() {},
	};
	return {
		doc, nativeMenu, form, createRow, observers,
		settings: new ChartPaletteSettings({ workspace }),
		flush(record) { for (const observer of observers) if (observer.connected) observer.callback([record]); },
	};
}

test('replacing direct settings rows cleans the old picker and enhances the new select in the same menu', () => {
	const host = harness();
	const old = host.createRow();
	host.form.append(old.row);
	host.settings.onload();
	assert.equal(old.select.enhancements, 1);
	assert.equal(host.doc.popupListeners.size, 1);

	const replacement = host.createRow();
	host.flush(host.form.replaceChildren(replacement.row));
	assert.equal(host.form.isConnected, true, 'the native menu root stays mounted');
	assert.equal(old.select.destructions, 1, 'detached settings release their picker');
	assert.equal(replacement.select.enhancements, 1, 'the replacement select gets its visual picker');
	assert.equal(host.doc.popupListeners.size, 1, 'only the current picker retains its listeners');
	assert.equal(host.doc.popupListeners.has(host.doc.pickers.get(old.select)), false);

	// More edits to the same menu must not duplicate the current enhancement.
	host.flush({ target: host.form, addedNodes: [new Element(host.doc)], removedNodes: [] });
	assert.equal(replacement.select.enhancements, 1);
	assert.equal(old.select.destructions, 1);

	host.flush(host.doc.body.replaceChildren());
	assert.equal(replacement.select.destructions, 1, 'removing the native menu still cleans its picker');
	assert.equal(host.doc.popupListeners.size, 0);
	host.settings.onunload();
	assert.ok(host.observers.every(observer => !observer.connected));
});
