import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	entryPoints: [fileURLToPath(new URL('../src/ui/chartFilesModal.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'native-modal-boundary',
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, () => ({
				contents: `export class Modal {
					constructor(app) { this.modalEl = app.makeElement(); this.contentEl = app.makeElement(); this.titleEl = app.makeElement(); }
					setTitle(title) { this.titleEl.textContent = title; return this; }
					close() { this.closed = true; this.onClose(); }
				}`,
			}));
		},
	}],
});
const { ChartFilesModal } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=chart-files-modal-under-test.mjs`).toString('base64')}`);

// Exercise list/search/pagination against a minimal text-only DOM boundary.
class Element {
	children = [];
	attributes = new Map();
	listeners = new Map();
	hidden = false;
	value = '';

	constructor(options = {}) {
		this.classes = new Set((options.cls ?? '').split(' ').filter(Boolean));
		this.textContent = options.text ?? '';
	}
	set innerHTML(_html) { throw new Error('File metadata must not be interpolated into HTML'); }
	createEl(tag, options) {
		const child = new Element(options);
		child.tag = tag;
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	addClass(cls) { this.classes.add(cls); }
	setAttribute(name, value) { this.attributes.set(name, value); }
	addEventListener(name, callback) { this.listeners.set(name, callback); }
	dispatch(name, event = {}) {
		this.listeners.get(name)?.(event);
		this.parentElement?.dispatch(name, event);
	}
	empty() { this.children = []; }
	focus() { this.focused = true; }
	find(cls) {
		if (this.classes.has(cls)) return this;
		for (const child of this.children) {
			const match = child.find(cls);
			if (match) return match;
		}
		return null;
	}
}

function createModal(files, openFile = async () => {}, details) {
	const modal = new ChartFilesModal({ makeElement: () => new Element() }, 'Folder: Study', 'Count: 205', files, openFile, details);
	modal.onOpen();
	return modal;
}

test('pagination limits initial DOM rows and appends the full list in batches', () => {
	const files = Array.from({ length: 205 }, (_, index) => ({ path: `Study/note-${index}.md`, value: index }));
	const modal = createModal(files);
	const list = modal.contentEl.find('bases-chart-files-table-body');
	const footer = modal.contentEl.find('bases-chart-files-footer');
	const more = footer.find('bases-chart-files-more');
	assert.equal(list.children.length, 100);
	assert.equal(modal.contentEl.find('bases-chart-files-count').textContent, '100 of 205 files shown');
	assert.equal(footer.hidden, false);
	more.dispatch('click');
	assert.equal(list.children.length, 200);
	assert.equal(list.children[100].find('bases-chart-file-open').focused, true);
	more.dispatch('click');
	assert.equal(list.children.length, 205);
	assert.equal(footer.hidden, true);
	assert.equal(modal.contentEl.find('bases-chart-files-count').textContent, '205 of 205 files shown');
});

test('search reaches unrendered files by full path and resets pagination', () => {
	const files = Array.from({ length: 205 }, (_, index) => ({ path: `Study/note-${index}.md`, value: index }));
	const modal = createModal(files);
	const search = modal.contentEl.find('bases-chart-files-search');
	const list = modal.contentEl.find('bases-chart-files-table-body');
	search.value = 'STUDY/NOTE-204.MD';
	search.dispatch('input');
	assert.equal(list.children.length, 1);
	assert.equal(list.children[0].attributes.get('title'), 'Study/note-204.md');
	assert.equal(modal.contentEl.find('bases-chart-files-count').textContent, '1 of 1 files shown (205 total)');
	search.value = '';
	search.dispatch('input');
	assert.equal(list.children.length, 100);
	assert.equal(modal.contentEl.find('bases-chart-files-footer').hidden, false);
});

test('rows disambiguate identical basenames and render metadata as safe text', () => {
	const files = [
		{ path: 'First/same.md', value: 2, group: 'Active' },
		{ path: 'Second/same.md', value: 3 },
		{ path: 'Review/<img src=x onerror=boom>.md', value: 4, group: '<script>unsafe</script>' },
	];
	const modal = createModal(files);
	const rows = modal.contentEl.find('bases-chart-files-table-body').children;
	assert.deepEqual(rows.slice(0, 2).map(row => row.find('bases-chart-file-name').textContent), ['same', 'same']);
	assert.deepEqual(rows.slice(0, 2).map(row => row.find('bases-chart-file-folder').textContent), ['First', 'Second']);
	assert.equal(rows[2].find('bases-chart-file-name').textContent, '<img src=x onerror=boom>');
	assert.equal(rows[2].find('bases-chart-file-group').textContent, '<script>unsafe</script>');
	assert.equal(rows[2].find('bases-chart-file-value').textContent, '4');
	assert.equal(modal.titleEl.textContent, 'Folder: Study');
});

test('file activation preserves Ctrl/Cmd and closes the native modal', () => {
	for (const modifiers of [{ ctrlKey: false, metaKey: false }, { ctrlKey: true, metaKey: false }, { ctrlKey: false, metaKey: true }]) {
		const opened = [];
		const modal = createModal([{ path: 'note.md', value: 0 }], async (path, newTab) => { opened.push({ path, newTab }); });
		const row = modal.contentEl.find('bases-chart-files-table-body').children[0];
		assert.equal(row.find('bases-chart-file-folder').textContent, '/');
		row.find('bases-chart-file-open').dispatch('click', modifiers);
		assert.deepEqual(opened, [{ path: 'note.md', newTab: modifiers.ctrlKey || modifiers.metaKey }]);
		assert.equal(modal.closed, true);
		assert.equal(modal.contentEl.children.length, 0);
	}
});

test('empty search results have a clear empty state and no pagination footer', () => {
	const modal = createModal([{ path: 'Study/note.md', value: 1 }]);
	const search = modal.contentEl.find('bases-chart-files-search');
	search.value = 'missing folder';
	search.dispatch('input');
	assert.equal(modal.contentEl.find('bases-chart-files-empty').textContent, 'No matching files.');
	assert.equal(modal.contentEl.find('bases-chart-files-footer').hidden, true);
	assert.equal(modal.contentEl.find('bases-chart-files-count').textContent, '0 of 0 files shown (1 total)');
	assert.equal(modal.contentEl.find('bases-chart-files-empty').colSpan, 2);
});

test('X-value title, condition chip, metric summary, and labeled table support a single file', () => {
	const details = { xName: 'Folder', xValue: 'Study/Computer science', yLabel: 'Study hours' };
	const modal = createModal([{ path: 'Study/lesson.md', value: 2.5 }], undefined, details);
	assert.equal(modal.titleEl.textContent, details.xValue);
	assert.equal(modal.contentEl.find('bases-chart-files-condition-property').textContent, 'Folder');
	assert.equal(modal.contentEl.find('bases-chart-files-condition-operator').textContent, 'is');
	assert.equal(modal.contentEl.find('bases-chart-files-condition-value').textContent, details.xValue);
	assert.equal(modal.contentEl.find('bases-chart-files-summary').textContent, 'Count: 205');
	const scroll = modal.contentEl.find('bases-chart-files-list');
	const table = scroll.find('bases-chart-files-table');
	assert.equal(table.tag, 'table');
	assert.equal(table.children[0].tag, 'thead');
	assert.equal(table.children[1].tag, 'tbody');
	assert.deepEqual(table.children[0].children[0].children.map(cell => [cell.tag, cell.textContent, cell.attributes.get('scope')]), [
		['th', 'File', 'col'], ['th', 'Study hours', 'col'],
	]);
	assert.equal(table.find('bases-chart-files-group-heading'), null);
	const row = table.find('bases-chart-files-table-body').children[0];
	assert.equal(row.tag, 'tr');
	assert.deepEqual(row.children.map(cell => cell.tag), ['td', 'td']);
	assert.equal(row.find('bases-chart-file-value').textContent, '2.5');
	assert.equal(modal.contentEl.find('bases-chart-files-footer').parentElement, modal.contentEl);
});

test('optional Group column remains stable during searches and details use safe text', () => {
	const details = { xName: '<b>Folder</b>', xValue: '<script>value</script>', yLabel: '<img> Amount' };
	const modal = createModal([
		{ path: 'Study/grouped.md', value: 1, group: 'First' },
		{ path: 'Study/plain.md', value: 2 },
	], undefined, details);
	assert.equal(modal.titleEl.textContent, details.xValue);
	assert.equal(modal.contentEl.find('bases-chart-files-condition-property').textContent, details.xName);
	assert.equal(modal.contentEl.find('bases-chart-files-value-heading').textContent, details.yLabel);
	assert.equal(modal.contentEl.find('bases-chart-files-group-heading').textContent, 'Group');
	const search = modal.contentEl.find('bases-chart-files-search');
	search.value = 'plain.md';
	search.dispatch('input');
	const rows = modal.contentEl.find('bases-chart-files-table-body').children;
	assert.equal(rows.length, 1);
	assert.equal(rows[0].children.length, 3);
	assert.equal(rows[0].find('bases-chart-file-group').textContent, '—');
	search.value = 'nothing';
	search.dispatch('input');
	assert.equal(modal.contentEl.find('bases-chart-files-empty').colSpan, 3);
});
