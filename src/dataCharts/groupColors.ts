import type { BasesEntryGroup, ListValue, Value } from 'obsidian';
import { CHART_PALETTES } from '../ui/chartPalettes';

export type GroupColorChoice = { type: 'preset'; value: string } | { type: 'custom'; value: string };

export interface GroupColorConfig {
	version: 1;
	overrides: Record<string, GroupColorChoice>;
}

const presetPalettes = CHART_PALETTES.filter(palette => palette.kind === 'sequential');
export const GROUP_COLOR_PRESETS: readonly { id: string; name: string }[] = Object.freeze(
	presetPalettes.map(({ id, name }) => Object.freeze({ id, name })),
);

export function getGroupColorIconId(presetId: string, isDark: boolean): string {
	return `bases-chart-group-${presetId}-${isDark ? 'dark' : 'light'}`;
}

const scalarTypes = new Set(['String', 'Number', 'Boolean', 'Date', 'Duration', 'Link', 'File']);
const MAX_KEY_LENGTH = 8192;
const MAX_LIST_LENGTH = 1024;
const MAX_KEY_DEPTH = 16;
type ColorIdentity = ['Null'] | [string, string] | ['List', ColorIdentity[]];

/** Public Value.type survives minification; display labels and row indices do not. */
function valueIdentity(value: Value | null, depth = 0): ColorIdentity | null {
	if (depth > MAX_KEY_DEPTH) return null;
	if (value === null) return ['Null'];
	const type: unknown = (value.constructor as { type?: unknown }).type;
	if (type === 'Null') return ['Null'];
	if (type === 'List') {
		const list = value as ListValue;
		if (typeof list.length !== 'function' || typeof list.get !== 'function') return null;
		const length = list.length();
		if (!Number.isInteger(length) || length < 0 || length > MAX_LIST_LENGTH) return null;
		const items: ColorIdentity[] = [];
		for (let index = 0; index < length; index++) {
			const item = valueIdentity(list.get(index), depth + 1);
			if (!item) return null;
			items.push(item);
		}
		return ['List', items];
	}
	// ObjectValue has no public property enumeration. Its display text cannot
	// identify a persisted value safely, so it remains on automatic colors.
	if (typeof type !== 'string' || !scalarTypes.has(type)) return null;
	const text = value.toString();
	if (type === 'Number' && (!text.trim() || !Number.isFinite(Number(text)))) return null;
	return [type, text];
}

/** Null keys mean either no grouping or a value without a safe, unique identity. */
export function getGroupColorKeys(groups: readonly BasesEntryGroup[]): (string | null)[] {
	const keys = groups.map(group => {
		if (group.key === undefined) return null;
		const identity = valueIdentity(group.key);
		if (!identity) return null;
		const key = JSON.stringify(identity);
		return key.length <= MAX_KEY_LENGTH ? key : null;
	});
	const counts = new Map<string, number>();
	for (const key of keys) if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
	return keys.map(key => key !== null && counts.get(key) === 1 ? key : null);
}

export function normalizeCustomColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const color = value.trim();
	if (/^#[\da-f]{6}$/i.test(color)) return color.toUpperCase();
	if (/^#[\da-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map(digit => digit + digit).join('')}`.toUpperCase();
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeGroupColorChoice(value: unknown): GroupColorChoice | null {
	if (!isRecord(value) || !Object.hasOwn(value, 'type') || !Object.hasOwn(value, 'value')) return null;
	if (value.type === 'preset' && GROUP_COLOR_PRESETS.some(preset => preset.id === value.value)) {
		return { type: 'preset', value: value.value as string };
	}
	const custom = value.type === 'custom' ? normalizeCustomColor(value.value) : null;
	return custom ? { type: 'custom', value: custom } : null;
}

function isIdentity(value: unknown, depth = 0): boolean {
	if (depth > MAX_KEY_DEPTH || !Array.isArray(value)) return false;
	if (value[0] === 'Null') return value.length === 1;
	if (value.length !== 2) return false;
	if (value[0] === 'List') return Array.isArray(value[1]) && value[1].length <= MAX_LIST_LENGTH
		&& value[1].every((item: unknown) => isIdentity(item, depth + 1));
	return typeof value[0] === 'string' && scalarTypes.has(value[0]) && typeof value[1] === 'string';
}

function isColorKey(key: string): boolean {
	if (key.length > MAX_KEY_LENGTH) return false;
	try {
		const value: unknown = JSON.parse(key);
		return isIdentity(value) && JSON.stringify(value) === key;
	} catch { return false; }
}

/** Read only validated, own overrides; malformed saved data falls back to the palette. */
export function readGroupColorConfig(value: unknown): GroupColorConfig {
	const overrides: Record<string, GroupColorChoice> = {};
	if (!isRecord(value) || !Object.hasOwn(value, 'version') || value.version !== 1
		|| !Object.hasOwn(value, 'overrides') || !isRecord(value.overrides)) return { version: 1, overrides };
	for (const [key, candidate] of Object.entries(value.overrides)) {
		const choice = isColorKey(key) ? normalizeGroupColorChoice(candidate) : null;
		if (choice) overrides[key] = choice;
	}
	return { version: 1, overrides };
}

/** Updating a visible group must preserve saved colors for temporarily hidden groups. */
export function withGroupColor(value: unknown, key: string, choice: GroupColorChoice | null): GroupColorConfig {
	const config = readGroupColorConfig(value);
	if (!isColorKey(key)) return config;
	if (choice === null) delete config.overrides[key];
	else {
		const normalized = normalizeGroupColorChoice(choice);
		if (normalized) config.overrides[key] = normalized;
	}
	return config;
}

export function resolveGroupColorChoice(choice: GroupColorChoice | null | undefined, isDark: boolean): string | undefined {
	const normalized = normalizeGroupColorChoice(choice);
	if (normalized?.type === 'custom') return normalized.value;
	if (normalized?.type !== 'preset') return undefined;
	const palette = presetPalettes.find(palette => palette.id === normalized.value);
	return (isDark ? palette?.dark : palette?.light)?.[0];
}
