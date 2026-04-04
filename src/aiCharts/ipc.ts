import type { DataAdapter } from 'obsidian';

const IPC_DIR = '.claude/ipc';

declare const require: ((module: string) => Record<string, unknown>) | undefined;

function getHostname(): string | null {
	try {
		return (require!('os') as { hostname(): string }).hostname();
	} catch {
		return null;
	}
}

function getIpcPath(): string | null {
	const host = getHostname();
	return host ? `${IPC_DIR}/bases-charts-${host}.json` : null;
}

export async function writeAiViewIpc(adapter: DataAdapter, viewName: string): Promise<void> {
	const path = getIpcPath();
	if (!path) return;
	await adapter.mkdir(IPC_DIR);
	await adapter.write(path, JSON.stringify({ activeAiView: { viewName } }, null, 2));
}

export async function clearAiViewIpc(adapter: DataAdapter): Promise<void> {
	const path = getIpcPath();
	if (!path) return;
	try {
		await adapter.remove(path);
	} catch { /* ignore if doesn't exist */ }
}
