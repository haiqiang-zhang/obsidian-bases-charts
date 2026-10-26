import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { lift, parse } from 'zrender/lib/tool/color.js';

const bundle = await build({
	stdin: {
		contents: "export * from './src/ui/chartPalettes'; export * from './src/ui/colors';",
		resolveDir: fileURLToPath(new URL('..', import.meta.url)),
		loader: 'ts',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
});
const {
	CHART_PALETTES, DEFAULT_CHART_PALETTE, getChartPalette, getPaletteColors,
	resolveColors, getResolvedColor,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function container(isDark = false, variables = {}) {
	const state = { isDark, reads: 0 };
	const element = {
		isConnected: true,
		doc: { body: { classList: { contains: name => name === 'theme-dark' && state.isDark } } },
		win: {
			getComputedStyle(target) {
				assert.equal(target, element);
				state.reads++;
				return { getPropertyValue: name => variables[name] ?? '' };
			},
		},
	};
	return { element, state };
}

function luminance(color) {
	const channels = parse(color).slice(0, 3).map(channel => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('Auto preserves the existing muted palette in both themes', () => {
	assert.equal(DEFAULT_CHART_PALETTE, 'auto');
	const palette = getChartPalette(DEFAULT_CHART_PALETTE);
	assert.equal(palette.name, 'Auto');
	assert.equal(palette.kind, 'categorical');
	assert.deepEqual(palette.light, ['#6B8EAD', '#88A28A', '#C0A269', '#BA8774', '#9C8AA5', '#74A29E', '#B68D9B', '#9B958B']);
	assert.deepEqual(palette.dark, ['#8BA9C3', '#A0B69E', '#CCB47E', '#CC9A87', '#B2A0BB', '#91B8B3', '#C5A1AE', '#ADA79D']);
});

test('detached embeds inherit colors from their own document and retain scoped styles after attachment', () => {
	for (const isDark of [false, true]) {
		const h = container(isDark);
		const bodyVariables = {
			'--text-normal': isDark ? '#eeeeee' : '#222222',
			'--text-muted': isDark ? '#aaaaaa' : '#555555',
			'--background-modifier-border': isDark ? '#444444' : '#dddddd',
			'--background-primary': isDark ? '#121212' : '#fafafa',
		};
		h.element.isConnected = false;
		h.element.win.getComputedStyle = target => {
			assert.equal(target, h.element.doc.body, 'use the owning popout body, never a global document');
			return { getPropertyValue: name => bodyVariables[name] ?? '' };
		};
		const detached = resolveColors(h.element, 'coastal');
		assert.equal(detached.text, bodyVariables['--text-normal']);
		assert.equal(detached.mutedText, bodyVariables['--text-muted']);
		assert.equal(detached.grid, bodyVariables['--background-modifier-border']);
		assert.equal(detached.background, bodyVariables['--background-primary']);
		assert.deepEqual(detached.palette, getPaletteColors('coastal', isDark));
		h.element.isConnected = true;
		h.element.win.getComputedStyle = target => {
			assert.equal(target, h.element);
			return { getPropertyValue: name => name === '--text-normal' ? '#123456' : bodyVariables[name] ?? '' };
		};
		const attached = resolveColors(h.element, 'coastal');
		assert.equal(attached.text, '#123456');
		assert.deepEqual(attached.palette, detached.palette, 'attachment must not change series and legend colors');
	}
});

test('missing, malformed, and unknown saved settings safely resolve to Auto', () => {
	const fallback = getChartPalette(DEFAULT_CHART_PALETTE);
	const values = [undefined, null, '', 'missing-palette', 'Blue', 0, true, [], {}, Symbol('blue'), { toString() { throw new Error('Do not coerce saved settings'); } }];
	for (const value of values) {
		assert.equal(getChartPalette(value), fallback);
		assert.deepEqual(getPaletteColors(value, false), fallback.light);
		assert.deepEqual(getPaletteColors(value, true), fallback.dark);
	}
	assert.equal(new Set(CHART_PALETTES.map(palette => palette.id)).size, CHART_PALETTES.length);
	for (const palette of CHART_PALETTES) assert.equal(getChartPalette(palette.id), palette);
});

test('palette snapshots cannot mutate the registry or other chart views', () => {
	const original = getChartPalette('blue');
	const first = getPaletteColors('blue', false);
	const second = getPaletteColors('blue', false);
	assert.notEqual(first, second);
	assert.notEqual(first, original.light);
	first[0] = '#000000';
	first.reverse();
	assert.deepEqual(second, original.light);
	assert.deepEqual(getPaletteColors('blue', false), original.light);
	assert.throws(() => { original.light[0] = '#000000'; }, TypeError);
	assert.throws(() => { original.name = 'Changed'; }, TypeError);
	assert.throws(() => { CHART_PALETTES.pop(); }, TypeError);

	const host = container();
	const blueView = resolveColors(host.element, 'blue');
	const earthView = resolveColors(host.element, 'earth');
	blueView.palette.fill('#000000');
	assert.deepEqual(earthView.palette, getPaletteColors('earth', false));
	assert.deepEqual(resolveColors(host.element, 'blue').palette, original.light);
});

test('each view resolves the selected palette and CSS through its owning window', () => {
	const firstWindow = container(false, { '--text-normal': ' #111111 ', '--background-modifier-border': ' #dddddd ', '--background-primary': ' #ffffff ' });
	const secondWindow = container(true, { '--text-normal': '#eeeeee', '--background-modifier-border': '#444444', '--background-primary': '#1e1e1e' });
	const light = resolveColors(firstWindow.element, 'coastal');
	const dark = resolveColors(secondWindow.element, 'coastal');
	assert.deepEqual(light.palette, getChartPalette('coastal').light);
	assert.deepEqual(dark.palette, getChartPalette('coastal').dark);
	assert.equal(light.text, '#111111');
	assert.equal(light.grid, '#dddddd');
	assert.equal(light.background, '#ffffff');
	assert.equal(dark.text, '#eeeeee');
	assert.equal(dark.grid, '#444444');
	assert.equal(dark.background, '#1e1e1e');
	assert.equal(firstWindow.state.reads, 1);
	assert.equal(secondWindow.state.reads, 1);

	firstWindow.state.isDark = true;
	assert.deepEqual(resolveColors(firstWindow.element, 'coastal').palette, dark.palette, 'the next update follows a theme change without a cached palette');
});

test('every palette uses its first color for an ungrouped series in either theme', () => {
	for (const palette of CHART_PALETTES) {
		for (const isDark of [false, true]) {
			const result = resolveColors(container(isDark).element, palette.id);
			const expected = isDark ? palette.dark : palette.light;
			assert.deepEqual(result.palette, expected);
			assert.equal(result.accent, expected[0]);
			assert.equal(getResolvedColor(result.palette, result.accent, 3, false), expected[0]);
			assert.equal(getResolvedColor(result.palette, result.accent, 9, true), expected[1]);
		}
	}
	assert.deepEqual(resolveColors(container().element).palette, getPaletteColors(DEFAULT_CHART_PALETTE, false));
});

test('every supplied color supports ECharts drawing and emphasis parsing', () => {
	for (const palette of CHART_PALETTES) {
		for (const theme of ['light', 'dark']) {
			assert.equal(palette[theme].length, 8, `${palette.id} ${theme} has eight colors`);
			assert.equal(new Set(palette[theme]).size, 8, `${palette.id} ${theme} has eight distinct colors`);
			for (const color of palette[theme]) {
				assert.match(color, /^#[\da-f]{6}$/i);
				assert.equal(parse(color)?.[3], 1, `${palette.id} ${color} parses as an opaque color`);
				const emphasized = lift(color, -0.1);
				assert.equal(typeof emphasized, 'string', `${palette.id} ${color} supports hover emphasis`);
				assert.equal(parse(emphasized)?.[3], 1);
			}
		}
	}
});

test('monochrome palettes contain distinct shades ordered from strong to soft in each theme', () => {
	const sequential = CHART_PALETTES.filter(palette => palette.kind === 'sequential');
	assert.equal(sequential.length, 9);
	assert.equal(getChartPalette('gray').name, 'Colorless');
	for (const palette of sequential) {
		for (const theme of ['light', 'dark']) {
			const shades = palette[theme];
			assert.equal(new Set(shades).size, shades.length, `${palette.id} ${theme} shades are distinct`);
			for (let index = 1; index < shades.length; index++) {
				const difference = luminance(shades[index]) - luminance(shades[index - 1]);
				assert.ok(theme === 'light' ? difference > 0 : difference < 0,
					`${palette.id} ${theme} shade ${index} should progress toward the background`);
			}
		}
	}
});
