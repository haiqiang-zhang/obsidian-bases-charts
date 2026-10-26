import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: [fileURLToPath(new URL('../src/aiCharts/ipc.ts', import.meta.url))],
	bundle: true, write: false, format: 'cjs', platform: 'node', external: ['obsidian'],
});

function harness(isDesktop) {
	const calls = [];
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require(name) {
		if (name === 'obsidian') return { Platform: { isDesktop } };
		calls.push(['require', name]);
		if (!isDesktop) throw new Error('Node APIs are unavailable on mobile');
		assert.equal(name, 'os');
		return { hostname: () => 'test-desktop' };
	} });
	const adapter = Object.fromEntries(['mkdir', 'write', 'remove'].map(method => [method, async (...args) => calls.push([method, ...args])]));
	return { ...module.exports, adapter, calls };
}

test('AI charts on mobile do not load desktop modules or write Claudian IPC', async () => {
	const h = harness(false);
	await h.writeAiViewIpc(h.adapter, 'Saved chart');
	await h.clearAiViewIpc(h.adapter);
	assert.deepEqual(h.calls, []);
});

test('desktop AI charts still publish their active view for Claudian', async () => {
	const h = harness(true);
	await h.writeAiViewIpc(h.adapter, 'Saved chart');
	const write = h.calls.find(([method]) => method === 'write');
	assert.equal(write[1], '.claude/ipc/bases-charts-test-desktop.json');
	assert.deepEqual(JSON.parse(write[2]), { activeAiView: { viewName: 'Saved chart' } });
	await h.clearAiViewIpc(h.adapter);
	assert.deepEqual(h.calls.at(-1), ['remove', write[1]]);
});
