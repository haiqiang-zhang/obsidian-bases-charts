import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
			export { Platform } from 'obsidian';
			export { ChartTooltip } from './src/ui/chartTooltip.ts';
			export { tooltipMetrics, positionTooltip, visibleTooltipBounds, findPlotBounds } from './src/ui/tooltipGeometry.ts';
		`,
		resolveDir: fileURLToPath(new URL('../', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	plugins: [{
		name: 'tooltip-host-boundaries',
		setup(builder) {
			builder.onResolve({ filter: /^(obsidian|\.\/chartFilesModal)$/ }, args => ({ path: args.path, namespace: 'host-stub' }));
			builder.onLoad({ filter: /.*/, namespace: 'host-stub' }, args => ({
				contents: args.path === 'obsidian'
					? 'export const Platform = { isMobile: false, isPhone: false }; export function setIcon(element, icon) { element.icon = icon; } export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
					: `export class ChartFilesModal {
						constructor(app, title, summary, files, openFile, details) {
							Object.assign(this, { app, title, summary, files, openFile, details });
							app.modals.push(this); app.events.push('construct');
						}
						open() { this.app.events.push('open'); }
						close() { this.app.events.push('close'); this.closed = true; }
					}`,
			}));
		},
	}],
});
const { Platform, ChartTooltip, tooltipMetrics, positionTooltip, visibleTooltipBounds, findPlotBounds } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=chart-tooltip-under-test.mjs`).toString('base64')}`);

class Element {
	children = [];
	parentElement = null;
	attributes = new Map();
	listeners = new Map();
	style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
	constructor(doc, options = {}) {
		this.ownerDocument = doc;
		this.className = options.cls ?? '';
		this.textContent = options.text ?? '';
		for (const [name, value] of Object.entries(options.attr ?? {})) this.attributes.set(name, value);
	}
	get win() { return this.ownerDocument.defaultView; }
	set innerHTML(_html) { throw new Error('Tooltip metadata must remain text nodes'); }
	createEl(tag, options) {
		const child = new Element(this.ownerDocument, options);
		child.tag = tag;
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	empty() { for (const child of this.children) child.parentElement = null; this.children = []; }
	addClass(cls) { if (!this.className.split(' ').includes(cls)) this.className = `${this.className} ${cls}`.trim(); }
	removeClass(cls) { this.className = this.className.split(' ').filter(name => name !== cls).join(' '); }
	setAttribute(name, value) { this.attributes.set(name, value); }
	addEventListener(name, callback) { this.listeners.set(name, callback); }
	dispatch(name, event = {}) { if (name !== 'click' || !this.disabled) return this.listeners.get(name)?.(event); }
	find(cls) {
		if (this.className.split(' ').includes(cls)) return this;
		for (const child of this.children) {
			const found = child.find(cls);
			if (found) return found;
		}
		return null;
	}
}

const context = { xName: 'Folder', yLabel: 'File count', groupNames: [], chartType: 'chart-bar', showPercentages: false };

function rawPoint(count = 63, overrides = {}) {
	return {
		x: 'Study/Computer science', y: count, chartIndex: 0, groupIndex: 0, isNumeric: true,
		files: Array.from({ length: count }, (_, index) => `Study/note-${index}.md`),
		fileValues: Array.from({ length: count }, () => 1),
		...overrides,
	};
}

function harness(width = 1280, height = 900, fontSize = 13, tooltipContext = context, touchPreview = false) {
	const app = { modals: [], events: [] };
	const opened = [];
	const doc = {
		defaultView: { innerWidth: width, innerHeight: height, getComputedStyle: () => ({ fontSize: `${fontSize}px` }) },
	};
	doc.defaultView.createDiv = options => new Element(doc, options);
	doc.defaultView.matchMedia = query => {
		assert.equal(query, '(orientation: portrait)');
		return { matches: doc.defaultView.innerHeight >= doc.defaultView.innerWidth };
	};
	doc.body = new Element(doc);
	const container = new Element(doc);
	container.getBoundingClientRect = () => ({ left: 150, top: 80 });
	const view = { app, openFile: async (path, newTab) => { opened.push({ path, newTab }); } };
	const previewEl = touchPreview ? doc.body.createDiv() : undefined;
	const tooltip = new ChartTooltip(container, view, () => app.events.push('hide'), previewEl);
	const options = tooltip.options({ trigger: 'axis' }, tooltipContext);
	return { app, opened, doc, container, tooltip, options, previewEl, view };
}

function previewButton(previewEl) { return previewEl.find('bases-chart-touch-preview-footer').children.find(child => child.tag === 'button'); }

test('single native groups keep their name and chosen color in tooltips, touch previews, and file details', () => {
	const raw = rawPoint(2);
	const color = '#9467BD';
	for (const chartType of ['chart-bar', 'chart-line', 'chart-area', 'chart-scatter', 'chart-pie']) {
		const grouped = { ...context, chartType, groupNames: ['Reading'], isGrouped: true };
		const h = harness(390, 844, 13, grouped, true);
		const params = { color, data: { _raw: raw } };
		const root = h.options.formatter(params);
		assert.equal(root.find('bases-chart-tooltip-file-name').textContent, 'Reading');
		assert.equal(root.find('bases-chart-tooltip-swatch').style.values.get('background-color'), color);
		h.tooltip.openFiles(raw, grouped);
		assert.ok(h.app.modals.at(-1).files.every(file => file.group === 'Reading'));
		assert.equal(h.app.modals.at(-1).summary, 'Reading · File count: 2');
		Platform.isPhone = Platform.isMobile = true;
		try {
			assert.equal(h.tooltip.preview(params, grouped), true);
			assert.equal(h.previewEl.find('bases-chart-touch-preview-name').textContent, 'Reading');
			assert.equal(h.previewEl.find('bases-chart-touch-preview-swatch').style.values.get('background-color'), color);
			previewButton(h.previewEl).dispatch('click');
			assert.ok(h.app.modals.at(-1).files.every(file => file.group === 'Reading'));
		} finally {
			h.tooltip.dispose();
			Platform.isPhone = Platform.isMobile = false;
		}
	}
});

test('ungrouped charts retain their measure name and omit synthetic group details', () => {
	for (const isGrouped of [undefined, false]) {
		const ungrouped = { ...context, groupNames: ['All files'], isGrouped };
		const h = harness(1280, 900, 13, ungrouped);
		const raw = rawPoint(2);
		const root = h.options.formatter({ data: { _raw: raw } });
		assert.equal(root.find('bases-chart-tooltip-file-name').textContent, context.yLabel);
		h.tooltip.openFiles(raw, ungrouped);
		assert.ok(h.app.modals[0].files.every(file => file.group === undefined));
		assert.equal(h.app.modals[0].summary, 'File count: 2');
		h.tooltip.dispose();
	}
});

test('100% bar tooltips display original contributions and shares, while details retain source values', () => {
	const normalized = { ...context, barLayout: 'percent', groupNames: ['Database', 'Networks', 'OS'], aggregateMode: 'Sum', showPercentages: true };
	const h = harness(1280, 900, 13, normalized);
	const raw = [2, 3, 1].map((y, groupIndex) => rawPoint(1, { y, groupIndex, fileValues: [y] }));
	const root = h.options.formatter(raw.map(p => ({ data: { _raw: p }, color: '#5785B1' })));
	const rows = root.find('bases-chart-tooltip-preview').children;
	assert.deepEqual(rows.slice(0, 3).map(row => row.find('bases-chart-tooltip-file-value').textContent), ['2 (33.3%)', '3 (50.0%)', '1 (16.7%)']);
	assert.equal(root.find('bases-chart-tooltip-total').find('bases-chart-tooltip-file-value').textContent, '6');
	h.tooltip.openFiles(raw, normalized);
	assert.deepEqual(h.app.modals[0].files.map(file => file.value), [2, 3, 1]);
	assert.deepEqual(h.app.modals[0].files.map(file => file.group), normalized.groupNames);
});

test('ordinary stack summaries distinguish sums of group averages from an overall average', () => {
	const grouped = { ...context, barLayout: 'stacked', groupNames: ['One', 'Two'], aggregateMode: 'Average' };
	const h = harness(1280, 900, 13, grouped);
	const root = h.options.formatter([80, 90].map((y, groupIndex) => ({ data: { _raw: rawPoint(1, { y, groupIndex }) } })));
	assert.equal(root.find('bases-chart-tooltip-total').find('bases-chart-tooltip-file-name').textContent, 'Sum of groups');
	assert.equal(root.find('bases-chart-tooltip-total').find('bases-chart-tooltip-file-value').textContent, '170');
});

test('zero-total percentage columns show 0% without invalid values', () => {
	const h = harness(1280, 900, 13, { ...context, barLayout: 'percent' });
	const root = h.options.formatter({ data: { _raw: rawPoint(1, { y: 0, fileValues: [0] }) } });
	assert.equal(root.find('bases-chart-tooltip-file-value').textContent, '0 (0.0%)');
	assert.equal(root.find('bases-chart-tooltip-total').find('bases-chart-tooltip-file-value').textContent, '0');
});

test('portrait percentage inspection keeps raw values and shares after touch release and opens raw details', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const normalized = { ...context, barLayout: 'percent', groupNames: ['One', 'Two'], aggregateMode: 'Sum' };
		const h = harness(390, 844, 13, normalized, true);
		const params = [2, 6].map((y, groupIndex) => ({ data: { _raw: rawPoint(1, { y, groupIndex, fileValues: [y] }) } }));
		assert.equal(h.tooltip.preview(params, normalized), true);
		const groups = h.previewEl.find('bases-chart-touch-preview-groups');
		assert.match(groups.className, /is-percent/);
		assert.deepEqual(groups.children.map(row => row.find('bases-chart-touch-preview-value').textContent), ['2 (25.0%)', '6 (75.0%)', '8']);
		previewButton(h.previewEl).dispatch('click');
		assert.deepEqual(h.app.modals[0].files.map(file => file.value), [2, 6]);
		assert.equal(h.previewEl.find('bases-chart-touch-preview-total').find('bases-chart-touch-preview-value').textContent, '8');
	} finally { Platform.isPhone = Platform.isMobile = false; }
});

test('fixed touch previews activate only for portrait phones with a shared preview host', () => {
	try {
		Platform.isPhone = true;
		Platform.isMobile = true;
		const state = harness(390, 844, 13, context, true);
		assert.equal(state.tooltip.usesTouchPreview(), true);
		assert.equal(harness(390, 844).tooltip.usesTouchPreview(), false, 'AI charts and callers without a host retain their behavior');
		state.doc.defaultView.innerWidth = 844;
		state.doc.defaultView.innerHeight = 390;
		assert.equal(state.tooltip.usesTouchPreview(), false);
		assert.equal(state.tooltip.preview({ data: { _raw: rawPoint() } }, context), false);
		assert.equal(state.previewEl.children.length, 0);
		state.doc.defaultView.innerWidth = 390;
		state.doc.defaultView.innerHeight = 844;
		assert.equal(state.tooltip.usesTouchPreview(), true, 'orientation is evaluated against the owning window');
		Platform.isPhone = false;
		assert.equal(state.tooltip.usesTouchPreview(), false, 'a portrait tablet must keep the full chart');
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('the shared preview remains empty and hidden until a valid touch selection', () => {
	const { tooltip, previewEl, app } = harness(390, 844, 13, context, true);
	tooltip.resetTouchPreview();
	assert.equal(previewEl.attributes.get('role'), 'region');
	assert.equal(previewEl.attributes.get('aria-label'), 'Chart selection');
	assert.equal(previewEl.children.length, 0);
	assert.ok(previewEl.className.split(' ').includes('bases-charts-hidden'));
	assert.equal(previewEl.find('bases-chart-touch-preview-footer'), null);
	assert.deepEqual(app.modals, []);
	Platform.isPhone = Platform.isMobile = true;
	try {
		assert.equal(tooltip.preview({ data: { _raw: null } }, context), false);
		assert.equal(previewEl.children.length, 0);
		assert.ok(previewEl.className.split(' ').includes('bases-charts-hidden'));
		assert.equal(tooltip.preview({ data: { _raw: rawPoint(2) } }, context), true);
		assert.ok(!previewEl.className.split(' ').includes('bases-charts-hidden'));
		const header = previewEl.find('bases-chart-touch-preview-header');
		assert.ok(header);
		assert.equal(tooltip.preview({ data: { _raw: null } }, context), false);
		assert.equal(previewEl.find('bases-chart-touch-preview-header'), header, 'selection persists when the finger leaves the data');
		assert.ok(!previewEl.className.split(' ').includes('bases-charts-hidden'));
		tooltip.resetTouchPreview();
		assert.equal(previewEl.children.length, 0);
		assert.ok(previewEl.className.split(' ').includes('bases-charts-hidden'));
	} finally {
		tooltip.dispose();
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('portrait preview caps groups and lazily opens all source files without replacing the selection', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const grouped = { ...context, groupNames: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'] };
		const { tooltip, previewEl, app, options } = harness(390, 844, 13, grouped, true);
		let fileValuesRead = 0;
		const params = grouped.groupNames.map((_, groupIndex) => ({ color: `#00${groupIndex}000`, data: { _raw: rawPoint(2, {
			groupIndex, y: groupIndex, files: [`group-${groupIndex}-a.md`, `group-${groupIndex}-b.md`],
			fileValues: [groupIndex, 0],
		}) } }));
		for (const param of params) Object.defineProperty(param.data._raw, 'fileValues', { get() { fileValuesRead++; return [param.data._raw.groupIndex, 0]; } });
		assert.equal(tooltip.preview(params, grouped), true);
		assert.equal(fileValuesRead, 0, 'touch moves must not build the entire file list');
		assert.equal(options.show, false);
		assert.equal(options.triggerOn, 'none');
		const header = previewEl.find('bases-chart-touch-preview-header');
		assert.equal(header.attributes.get('aria-live'), 'polite');
		assert.equal(previewEl.find('bases-chart-touch-preview-property').textContent, 'Folder · File count');
		assert.equal(previewEl.find('bases-chart-touch-preview-title').textContent, 'Study/Computer science');
		const rows = previewEl.find('bases-chart-touch-preview-groups').children;
		assert.deepEqual(rows.map(row => row.find('bases-chart-touch-preview-name').textContent), ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']);
		assert.deepEqual(rows.map(row => row.find('bases-chart-touch-preview-value').textContent), ['0', '1', '2', '3', '4', '5']);
		assert.equal(rows[1].find('bases-chart-touch-preview-swatch').style.values.get('background-color'), '#001000');
		assert.equal(previewEl.find('bases-chart-touch-preview-footer').children[0].textContent, '16 files · +2 more groups');
		const button = previewButton(previewEl);
		assert.equal(button.textContent, 'View data');
		assert.equal(button.attributes.get('aria-haspopup'), 'dialog');
		assert.equal(app.modals.length, 0, 'selecting a datum never opens the drawer');
		button.dispatch('click');
		assert.equal(app.modals[0].files.length, 16);
		assert.ok(fileValuesRead > 0);
		assert.equal(app.modals[0].files.at(-1).group, 'Eighth');
		app.modals[0].close();
		assert.equal(previewEl.find('bases-chart-touch-preview-header'), header, 'opening/closing data preserves the fixed selection');
		assert.equal(previewButton(previewEl), button);
		tooltip.dispose();
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('unchanged previews preserve their action while opening the newest files, and invalid touches retain the selection', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const { tooltip, previewEl, app } = harness(390, 844, 13, context, true);
		tooltip.preview({ data: { _raw: rawPoint(1, { files: ['old.md'] }) } }, context);
		const button = previewButton(previewEl);
		assert.equal(tooltip.preview({ data: { _raw: rawPoint(1, { files: ['new.md'] }) } }, context), true);
		assert.equal(previewButton(previewEl), button, 'do not discard a focused button on repeated column moves');
		assert.equal(tooltip.preview({ data: { _raw: null } }, context), false);
		assert.equal(previewButton(previewEl), button);
		button.dispatch('click');
		assert.equal(app.modals[0].files[0].path, 'new.md');
		tooltip.resetTouchPreview();
		assert.equal(previewEl.find('bases-chart-touch-preview-header'), null);
		button.dispatch('click');
		assert.equal(app.modals.length, 1, 'reset removes the previous selection even if a detached action is invoked');
		tooltip.dispose();
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('multiple chart renderers can replace the shared preview without stale deduplication', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const { tooltip, previewEl, container, view, app } = harness(390, 844, 13, context, true);
		const other = new ChartTooltip(container, view, () => {}, previewEl);
		const first = { data: { _raw: rawPoint(1, { x: 'First chart', files: ['first.md'] }) } };
		tooltip.preview(first, context);
		other.preview({ data: { _raw: rawPoint(1, { x: 'Second chart', files: ['second.md'] }) } }, context);
		assert.equal(previewEl.find('bases-chart-touch-preview-title').textContent, 'Second chart');
		previewButton(previewEl).dispatch('click');
		assert.equal(app.modals.at(-1).files[0].path, 'second.md');
		tooltip.preview(first, context);
		assert.equal(previewEl.find('bases-chart-touch-preview-title').textContent, 'First chart');
		previewButton(previewEl).dispatch('click');
		assert.equal(app.modals.at(-1).files[0].path, 'first.md');
		tooltip.dispose();
		other.dispose();
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('shared grouped previews identify the selected measure even when group values are identical', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const { tooltip, previewEl } = harness(390, 844, 13, context, true);
		const grouped = { ...context, groupNames: ['Work', 'Study'], yLabel: 'Hours (Sum)' };
		const params = { data: { _raw: rawPoint(1) } };
		tooltip.preview(params, grouped);
		assert.equal(previewEl.find('bases-chart-touch-preview-property').textContent, 'Folder · Hours (Sum)');
		tooltip.preview(params, { ...grouped, yLabel: 'Score (Average)' });
		assert.equal(previewEl.find('bases-chart-touch-preview-property').textContent, 'Folder · Score (Average)');
		tooltip.dispose();
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('fixed previews keep malicious labels as text and preserve pie percentages', () => {
	Platform.isPhone = Platform.isMobile = true;
	try {
		const special = { ...context, xName: '<b>Folder</b>', yLabel: '<svg onload=alert(1)>', chartType: 'chart-pie', showPercentages: true };
		const { tooltip, previewEl, app } = harness(390, 844, 13, special, true);
		tooltip.preview({ percent: 12.5, data: { _raw: rawPoint(1, { x: '<img src=x onerror=alert(1)>', y: 5 }) } }, special);
		assert.equal(previewEl.find('bases-chart-touch-preview-property').textContent, '<b>Folder</b> · <svg onload=alert(1)>');
		assert.equal(previewEl.find('bases-chart-touch-preview-title').textContent, '<img src=x onerror=alert(1)>');
		assert.equal(previewEl.find('bases-chart-touch-preview-name').textContent, '<svg onload=alert(1)>');
		assert.equal(previewEl.find('bases-chart-touch-preview-value').textContent, '5 (12.5%)');
		assert.equal(previewEl.find('bases-chart-touch-preview-footer').children[0].textContent, '1 file');
		previewButton(previewEl).dispatch('click');
		assert.equal(app.modals[0].summary, '<svg onload=alert(1)>: 5 (12.5%)');
		tooltip.preview({ data: { _raw: rawPoint(0) } }, special);
		assert.equal(previewButton(previewEl).disabled, true, 'empty selections have no actionable source data');
		previewButton(previewEl).dispatch('click');
		assert.equal(app.modals.length, 1);
		tooltip.dispose();
	} finally {
		Platform.isPhone = Platform.isMobile = false;
	}
});

test('63-file columns show a small summary with no interactive file preview', () => {
	for (const [width, height, fontSize] of [[1280, 900, 13], [360, 320, 13], [360, 190, 13], [1280, 900, 26]]) {
		const { options, doc, container } = harness(width, height, fontSize);
		const root = options.formatter({ data: { _raw: rawPoint() } });
		assert.equal(root.ownerDocument, doc);
		assert.equal(doc.body.children.length, 0, 'ECharts controls when the tooltip enters the document');
		assert.equal(container.children.length, 0, 'formatting must not append to the chart container');
		assert.equal(root.find('bases-chart-tooltip-property').textContent, 'Folder');
		assert.equal(root.find('bases-chart-tooltip-title').textContent, 'Study/Computer science');
		assert.ok(root.find('bases-chart-tooltip-preview').children.length <= 1);
		assert.equal(root.find('bases-chart-tooltip-file'), null);
		assert.equal(root.find('bases-chart-tooltip-view-all'), null);
		assert.equal(root.find('bases-chart-tooltip-hint').textContent, 'Click to view data');
		assert.equal(options.enterable, false);
		assert.equal(options.hideDelay, 0);
	}
});

test('column activation hides the tooltip and passes all files into the data modal', async () => {
	const { app, opened, tooltip } = harness();
	const raw = rawPoint();
	tooltip.openFiles(raw, context);
	assert.deepEqual(app.events, ['hide', 'construct', 'open']);
	const modal = app.modals[0];
	assert.equal(modal.title, 'Folder: Study/Computer science');
	assert.equal(modal.summary, 'File count: 63');
	assert.deepEqual(modal.files.map(file => file.path), raw.files);
	await modal.openFile(raw.files[62], true);
	assert.deepEqual(opened, [{ path: raw.files[62], newTab: true }]);
	tooltip.dispose();
	assert.equal(modal.closed, true);
});

test('X metadata and group labels remain safe text', () => {
	const { options } = harness(1280, 900, 13, { ...context, xName: '<b>Folder</b>', groupNames: ['<img src=x>', 'Work'] });
	const root = options.formatter({ data: { _raw: rawPoint(1, { x: '<script>unsafe</script>' }) } });
	assert.equal(root.find('bases-chart-tooltip-property').textContent, '<b>Folder</b>');
	assert.equal(root.find('bases-chart-tooltip-title').textContent, '<script>unsafe</script>');
	assert.equal(root.find('bases-chart-tooltip-file-name').textContent, '<img src=x>');
});

test('group summaries retain zero values and column activation includes files from all groups', () => {
	const groupedContext = { ...context, groupNames: ['Zero group', 'Other group'] };
	const { options, app, tooltip } = harness(1280, 900, 13, groupedContext);
	const zero = rawPoint(1, { y: 0, files: ['zero.md'], fileValues: [0], groupIndex: 0 });
	const other = rawPoint(1, { y: 2, files: ['other.md'], fileValues: [2], groupIndex: 1 });
	const root = options.formatter([{ data: { _raw: zero } }, { data: { _raw: other } }]);
	const rows = root.find('bases-chart-tooltip-preview').children;
	assert.deepEqual(rows.map(row => row.find('bases-chart-tooltip-file-name').textContent), ['Zero group', 'Other group']);
	assert.deepEqual(rows.map(row => row.find('bases-chart-tooltip-file-value').textContent), ['0', '2']);
	tooltip.openFiles([zero, other], groupedContext);
	assert.deepEqual(app.modals[0].files, [
		{ path: 'zero.md', value: 0, group: 'Zero group' },
		{ path: 'other.md', value: 2, group: 'Other group' },
	]);
});

test('positioning clamps every viewport edge in chart-local coordinates with nonzero chart offset', () => {
	const rect = { left: 150, top: 80 };
	const viewport = { width: 800, height: 600 };
	const content = [300, 180];
	const { options, container, doc } = harness(viewport.width, viewport.height);
	assert.equal(options.appendTo(container), doc.body);
	for (const [viewportX, viewportY] of [[0, 0], [799, 0], [0, 599], [799, 599], [400, 300]]) {
		const point = [viewportX - rect.left, viewportY - rect.top];
		const local = positionTooltip(point, content, rect, viewport, undefined, 52);
		assert.deepEqual(options.position(point, { seriesIndex: viewportX, dataIndex: viewportY }, null, null, { contentSize: content, viewSize: [200, 150] }), local);
		const left = local[0] + rect.left;
		const top = local[1] + rect.top;
		assert.ok(left >= 12 && left + content[0] <= viewport.width - 12);
		assert.ok(top >= 12 && top + content[1] <= viewport.height - 12);
	}
});

test('geometry permits zero rows and caps group previews at five without negative dimensions', () => {
	for (const [width, height, fontSize] of [[16, 16, 13], [320, 190, 13], [320, 320, 13], [1600, 1000, 13], [1600, 1000, 30]]) {
		const metrics = tooltipMetrics(width, height, fontSize);
		assert.ok(metrics.width >= 0 && metrics.width <= 260);
		assert.ok(metrics.maxHeight >= 0 && metrics.maxHeight <= 280);
		assert.ok(Number.isInteger(metrics.rowLimit) && metrics.rowLimit >= 0 && metrics.rowLimit <= 5);
	}
	assert.equal(tooltipMetrics(320, 140).rowLimit, 0);
	assert.equal(tooltipMetrics(1600, 1000).rowLimit, 5);
});

test('a missing data point has no tooltip and opening another selection closes the previous modal', () => {
	const { options, tooltip, app } = harness();
	assert.equal(options.formatter([{ data: { _raw: null } }]), '');
	tooltip.openFiles(rawPoint(2), context);
	const first = app.modals[0];
	tooltip.openFiles(rawPoint(3), context);
	assert.equal(first.closed, true);
	assert.equal(app.modals[1].files.length, 3);
	assert.deepEqual(app.events, ['hide', 'construct', 'open', 'hide', 'close', 'construct', 'open']);
});


test('side placement keeps the hovered point clear when vertical space is limited', () => {
	const viewport = { width: 800, height: 400 };
	const rect = { left: 0, top: 0 };
	for (const point of [[400, 200], [720, 200], [40, 200]]) {
		const [x, y] = positionTooltip(point, [280, 260], rect, viewport);
		assert.ok(x >= 12 && x + 280 <= 788);
		assert.ok(y >= 12 && y + 260 <= 388);
		assert.ok(x > point[0] + 12 || x + 280 < point[0] - 12);
	}
});

test('CSS-scaled charts still position the body tooltip within the viewport', () => {
	const viewport = { width: 800, height: 600 };
	for (const scale of [0.75, 1.5, 2]) {
		const rect = { left: 100, top: 50, width: 400 * scale, height: 200 * scale };
		const [x, y] = positionTooltip([300, 150], [280, 200], rect, viewport, [400, 200]);
		const left = 100 + x * scale;
		const top = 50 + y * scale;
		assert.ok(left >= 12 && left + 280 <= 788);
		assert.ok(top >= 12 && top + 200 <= 588);
	}
});

test('a single visible group keeps its label and color instead of expanding into files', () => {
	const { options } = harness(1280, 900, 13, { ...context, groupNames: ['English', 'Work'] });
	const root = options.formatter({ color: '#61b589', data: { _raw: rawPoint(40, { groupIndex: 1 }) } });
	const rows = root.find('bases-chart-tooltip-preview').children;
	assert.equal(rows.length, 1);
	assert.equal(rows[0].find('bases-chart-tooltip-file-name').textContent, 'Work');
	assert.equal(rows[0].find('bases-chart-tooltip-swatch').style.values.get('background-color'), '#61b589');
	assert.equal(root.find('bases-chart-tooltip-hint').textContent, 'Click to view data');
});


test('tooltip is anchored to data and does not follow cursor movement inside the same column', () => {
	const { tooltip } = harness();
	const options = tooltip.options({}, context, () => [300, 200]);
	const size = { contentSize: [260, 150], viewSize: [700, 500] };
	const params = { seriesIndex: 0, dataIndex: 2 };
	const initial = options.position([100, 100], params, null, null, size);
	assert.deepEqual(options.position([500, 450], params, null, null, size), initial);
	const fallback = tooltip.options({}, context);
	const fallbackInitial = fallback.position([100, 100], params, null, null, size);
	assert.deepEqual(fallback.position([500, 450], params, null, null, size), fallbackInitial);
});

test('Cartesian previews stay above the X axis and away from the legend at low-valued points', () => {
	const rect = { left: 150, top: 180, width: 700, height: 400 };
	const viewport = { width: 1100, height: 800 };
	const plot = { left: 48, top: 38, width: 640, height: 282 };
	const bounds = visibleTooltipBounds(plot, rect, viewport, [700, 400]);
	for (const point of [[50, 310], [350, 310], [680, 310], [350, 45]]) {
		const [x, y] = positionTooltip(point, [280, 230], rect, viewport, [700, 400], 16, bounds);
		assert.ok(x + rect.left >= bounds.left && x + rect.left + 280 <= bounds.left + bounds.width);
		assert.ok(y + rect.top >= bounds.top && y + rect.top + 230 <= rect.top + plot.top + plot.height - 8,
			'the entire tooltip must stay above the X-axis boundary, including for low-valued points');
	}
	const [x, y] = positionTooltip([350, 310], [280, 150], rect, viewport, [700, 400], 16, bounds);
	assert.ok(y + 150 < 310 && x <= 350 && x + 280 >= 350, 'prefer above the anchored point when it fits');
});

test('visible plot limits shrink grouped previews when a chart is clipped by its scrolling pane', () => {
	const grouped = { ...context, chartType: 'chart-line', groupNames: Array.from({ length: 8 }, (_, i) => `Group ${i}`) };
	const { tooltip, container } = harness(1200, 800, 13, grouped);
	container.clientWidth = 700;
	container.clientHeight = 400;
	container.getBoundingClientRect = () => ({ left: 150, top: -100, width: 700, height: 400 });
	container.closest = () => ({ getBoundingClientRect: () => ({ left: 150, top: 100, right: 850, bottom: 700 }) });
	const options = tooltip.options({}, grouped, () => [350, 300], () => ({ left: 48, top: 38, width: 640, height: 282 }));
	const params = grouped.groupNames.map((_, groupIndex) => ({ seriesIndex: groupIndex, dataIndex: 0, data: { _raw: rawPoint(1, { groupIndex }) } }));
	const root = options.formatter(params);
	const height = parseFloat(root.style.values.get('--chart-tooltip-max-height'));
	assert.equal(height, 112, 'available height ends before the X axis and starts below the fixed header');
	assert.equal(root.find('bases-chart-tooltip-preview').children.length, 0, 'short visible plots keep a bounded header/footer instead of overflowing rows');
	assert.equal(root.find('bases-chart-tooltip-count').textContent, '+8 more groups');
	const [x, y] = options.position([600, 350], params, null, null, { contentSize: [280, height], viewSize: [700, 400] });
	assert.ok(x >= 56 && x + 280 <= 680);
	assert.equal(y - 100, 100, 'tooltip is placed within the visible plot, not behind the pane header');
	container.getBoundingClientRect = () => ({ left: 150, top: -200, width: 700, height: 400 });
	assert.equal(options.formatter(params), '', 'a barely visible chart suppresses an unreadable preview; clicks still use the modal');
	assert.equal(tooltip.options({}, grouped, undefined, () => null).formatter(params), '', 'an unavailable plot must not place a preview over the axes');
});

test('plot detection and CSS-scaled placement honor fractional chart bounds without private ECharts access', () => {
	const actual = { left: 47.5, top: 38.25, width: 620.5, height: 281.75 };
	const contains = ([x, y]) => x >= actual.left && x <= actual.left + actual.width && y >= actual.top && y <= actual.top + actual.height;
	const found = findPlotBounds(700, 400, contains);
	for (const side of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(found[side] - actual[side]) < 0.5);
	assert.equal(findPlotBounds(700, 400, () => false), null);
	for (const scale of [0.75, 1.5]) {
		const rect = { left: 80, top: 60, width: 700 * scale, height: 400 * scale };
		const viewport = { width: 1400, height: 900 };
		const bounds = visibleTooltipBounds(found, rect, viewport, [700, 400]);
		const metrics = tooltipMetrics(viewport.width, viewport.height, 13, bounds);
		const [x, y] = positionTooltip([350, 310], [metrics.width, metrics.maxHeight], rect, viewport, [700, 400], 16, bounds);
		assert.ok(rect.left + x * scale >= bounds.left);
		assert.ok(rect.top + y * scale >= bounds.top);
		assert.ok(rect.left + x * scale + metrics.width <= bounds.left + bounds.width + 0.01);
		assert.ok(rect.top + y * scale + metrics.maxHeight <= bounds.top + bounds.height + 0.01);
	}
});

test('radar previews original category values and opens source rows without a synthetic total', () => {
	const radarContext = { ...context, chartType: 'chart-radar', xName: 'Department', yLabel: 'Values' };
	const { options, tooltip, app } = harness(1280, 900, 13, radarContext);
	const sales = rawPoint(2, { x: 'Sales', y: 15, files: ['sales-a.md', 'sales-b.md'], fileValues: [10, 5] });
	const support = rawPoint(1, { x: 'Support', y: 0, files: ['support.md'], fileValues: [0] });
	const raw = rawPoint(1, {
		x: 'not a category', y: 999999, files: ['synthetic.md'], fileValues: [999999],
		radar: { name: 'Spending · Actual', property: 'Spending', values: [
			{ category: 'Sales', value: 15, point: sales },
			{ category: 'Support', value: 0, point: support },
			{ category: '<Marketing>', value: null, point: null },
		] },
	});
	const root = options.formatter({ color: '#6699aa', data: { _raw: raw } });
	assert.equal(root.find('bases-chart-tooltip-property').textContent, 'Series');
	assert.equal(root.find('bases-chart-tooltip-title').textContent, 'Spending · Actual');
	const rows = root.find('bases-chart-tooltip-preview').children;
	assert.deepEqual(rows.map(row => row.find('bases-chart-tooltip-file-name').textContent), ['Sales', 'Support', '<Marketing>']);
	assert.deepEqual(rows.map(row => row.find('bases-chart-tooltip-file-value').textContent), ['15', '0', '—']);
	assert.ok(rows.every(row => row.find('bases-chart-tooltip-swatch').style.values.get('background-color') === '#6699aa'));
	tooltip.openFiles(raw, radarContext);
	const modal = app.modals[0];
	assert.equal(modal.summary, 'Spending · 3 categories');
	assert.deepEqual(modal.files, [
		{ path: 'sales-a.md', value: 10, group: 'Sales' },
		{ path: 'sales-b.md', value: 5, group: 'Sales' },
		{ path: 'support.md', value: 0, group: 'Support' },
	]);
	assert.deepEqual(modal.details, { xName: 'Series', xValue: 'Spending · Actual', yLabel: 'Spending', groupLabel: 'Department' });
	tooltip.dispose();
});

test('a large radar preview caps visible categories while the modal retains all source values', () => {
	const radarContext = { ...context, chartType: 'chart-radar', xName: 'Category' };
	const { options, tooltip, app } = harness(1280, 900, 13, radarContext);
	const values = Array.from({ length: 12 }, (_, index) => ({
		category: `Category ${index}`, value: index,
		point: rawPoint(1, { files: [`category-${index}.md`], fileValues: [index] }),
	}));
	const raw = rawPoint(0, { radar: { name: 'Budget', property: 'Budget', values } });
	const root = options.formatter({ data: { _raw: raw } });
	assert.equal(root.find('bases-chart-tooltip-preview').children.length, 5);
	assert.equal(root.find('bases-chart-tooltip-count').textContent, '+7 more categories');
	tooltip.openFiles(raw, radarContext);
	assert.equal(app.modals[0].files.length, 12);
	assert.deepEqual(app.modals[0].files.map(file => file.value), values.map(item => item.value));
	tooltip.dispose();
});


test('mobile charts without a fixed preview retain data drawer access without a floating tooltip', () => {
    Platform.isMobile = true;
    try {
        const { options, tooltip, app } = harness(390, 844);
        assert.equal(options.show, false);
        assert.equal(options.triggerOn, 'none');
        tooltip.openFiles(rawPoint(8), context);
        assert.equal(app.modals.length, 1);
        assert.equal(app.modals[0].files.length, 8);
        assert.equal(app.events.at(-1), 'open');
    } finally {
        Platform.isMobile = false;
    }
    assert.equal(harness().options.show, true);
});
