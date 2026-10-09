import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	entryPoints: [fileURLToPath(new URL('../src/ui/chartToolbar.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'obsidian-component-stub',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({
				contents: `
					export class Component { registeredEvents = []; registerEvent(ref) { this.registeredEvents.push(ref); } }
					export function setIcon() {}
					export class StringValue {}
					export class NumberValue {}
					export class DateValue {}
					export class ListValue {}
				`,
			}));
		},
	}],
});
const { ChartToolbar } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

// A narrow element fixture for toolbar mounting, summaries, and removal.
// Popup rendering and native configuration persistence require app testing.
class Element {
	children = [];
	attributes = new Map();
	parentElement = null;

	constructor(options = {}) {
		this.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		this.textContent = options.text ?? '';
	}

	createEl(_tag, options) {
		const child = new Element(options);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	addClass(cls) { this.classes.add(cls); }
	removeClass(cls) { this.classes.delete(cls); }
	setAttribute(key, value) { this.attributes.set(key, value); }
	addEventListener() {}
	querySelector(selector) {
		for (const child of this.children) {
			if (child.classes.has(selector.slice(1))) return child;
			const found = child.querySelector(selector);
			if (found) return found;
		}
		return null;
	}
	remove() {
		if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
	}
}

test('loading before Bases assigns config waits for data-updated without touching DOM', () => {
	let onDataUpdated;
	const eventRef = {};
	let domReads = 0;
	const view = {
		config: undefined,
		get containerEl() {
			domReads++;
			throw new Error('Bases has not assigned config yet');
		},
		events: {
			on(name, callback) {
				assert.equal(name, 'data-updated');
				onDataUpdated = callback;
				return eventRef;
			},
		},
	};
	const toolbar = new ChartToolbar(view);
	assert.doesNotThrow(() => toolbar.onload());
	assert.doesNotThrow(() => onDataUpdated());
	assert.equal(domReads, 0);
	assert.deepEqual(toolbar.registeredEvents, [eventRef]);
	assert.doesNotThrow(() => toolbar.onunload());
});

test('first data update mounts axes after config assignment and unload removes them', () => {
	let onDataUpdated;
	const nativeToolbar = new Element();
	const containerEl = new Element();
	containerEl.parentElement = { querySelector: () => nativeToolbar };
	const view = {
		config: undefined,
		containerEl,
		getYProperties: () => ['note.amount', 'file.name'],
		events: { on: (_name, callback) => { onDataUpdated = callback; return {}; } },
	};
	const toolbar = new ChartToolbar(view);
	toolbar.onload();
	assert.equal(nativeToolbar.children.length, 0);

	view.config = {
		getAsPropertyId: () => 'file.folder',
		getOrder: () => ['note.amount', 'file.name'],
		getDisplayName: () => 'Folder',
	};
	onDataUpdated();
	assert.equal(nativeToolbar.children.length, 2);
	assert.equal(nativeToolbar.querySelector('.bases-chart-x-menu').querySelector('.bases-chart-axis-summary').textContent, 'Folder');
	assert.equal(nativeToolbar.querySelector('.bases-chart-y-menu').querySelector('.bases-chart-axis-summary').textContent, '2');
	onDataUpdated();
	assert.equal(nativeToolbar.children.length, 2, 'updates must not duplicate toolbar buttons');

	toolbar.onunload();
	assert.equal(nativeToolbar.children.length, 0);
	assert.equal(nativeToolbar.classes.has('bases-chart-toolbar'), false);
});
