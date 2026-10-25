import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
	stdin: {
		contents: `
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
					? 'export class DateValue {} export class ListValue {} export class NumberValue {} export class StringValue {}'
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
const { ChartTooltip, tooltipMetrics, positionTooltip, visibleTooltipBounds, findPlotBounds } = await import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=chart-tooltip-under-test.mjs`).toString('base64')}`);

class Element {
	children = [];
	attributes = new Map();
	listeners = new Map();
	style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
	constructor(doc, options = {}) {
		this.ownerDocument = doc;
		this.className = options.cls ?? '';
		this.textContent = options.text ?? '';
		for (const [name, value] of Object.entries(options.attr ?? {})) this.attributes.set(name, value);
	}
	set innerHTML(_html) { throw new Error('Tooltip metadata must remain text nodes'); }
	createEl(tag, options) {
		const child = new Element(this.ownerDocument, options);
		child.tag = tag;
		this.children.push(child);
		return child;
	}
	createDiv(options) { return this.createEl('div', options); }
	createSpan(options) { return this.createEl('span', options); }
	addEventListener(name, callback) { this.listeners.set(name, callback); }
	dispatch(name, event = {}) { return this.listeners.get(name)?.(event); }
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

function harness(width = 1280, height = 900, fontSize = 13, tooltipContext = context) {
	const app = { modals: [], events: [] };
	const opened = [];
	const doc = {
		defaultView: { innerWidth: width, innerHeight: height, getComputedStyle: () => ({ fontSize: `${fontSize}px` }) },
		createDocumentFragment: () => new Element(doc),
	};
	doc.body = new Element(doc);
	const container = new Element(doc);
	container.getBoundingClientRect = () => ({ left: 150, top: 80 });
	const view = { app, openFile: async (path, newTab) => { opened.push({ path, newTab }); } };
	const tooltip = new ChartTooltip(container, view, () => app.events.push('hide'));
	const options = tooltip.options({ trigger: 'axis' }, tooltipContext);
	return { app, opened, doc, container, tooltip, options };
}

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
