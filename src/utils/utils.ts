import type { Value } from 'obsidian';
import { DateValue, ListValue, NumberValue, StringValue } from 'obsidian';

export function toCompactString(datum: object | number | string | symbol | boolean | Date | null | undefined): string {
	if (datum == null) {
		return '';
	}
	if (typeof datum === 'number') {
		return datum.toLocaleString(undefined, { notation: 'compact', roundingPriority: 'auto', maximumSignificantDigits: 4 });
	}
	if (typeof datum === 'boolean') {
		return datum ? 'Yes' : 'No';
	}
	if (typeof datum === 'symbol') {
		return Symbol.keyFor(datum) ?? '';
	}
	if (datum instanceof Date) {
		return datum.toLocaleDateString();
	}
	if (typeof datum === 'object') {
		return 'object';
	}
	return datum;
}

export const OBSIDIAN_COLOR_PALETTE = [
	'var(--color-blue)',
	'var(--color-orange)',
	'var(--color-red)',
	'var(--color-cyan)',
	'var(--color-green)',
	'var(--color-yellow)',
	'var(--color-purple)',
	'var(--color-pink)',
];

export function getFileDisplayName(filePath: string): string {
	return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
}

export function parseValueAsNumber(value: Value | null): number | null {
	if (!value) {
		return null;
	}

	if (value instanceof NumberValue) {
		return value.data;
	}
	if (value instanceof StringValue) {
		const parsed = parseFloat(value.data);
		return isNaN(parsed) ? null : parsed;
	}
	return null;
}

export type XValue = number | Date | string;

function parseSingleValueAsX(value: Value): XValue | null {
	if (value instanceof NumberValue) {
		return value.data;
	}
	if (value instanceof StringValue) {
		return value.data;
	}
	if (value instanceof DateValue) {
		return new Date(value.toString());
	}
	const str = value.toString();
	if (str) {
		return str;
	}
	return null;
}

export function parseValueAsX(value: Value | null): XValue[] | null {
	if (!value) {
		return null;
	}

	if (value instanceof ListValue) {
		const result: XValue[] = [];
		for (let i = 0; i < value.length(); i++) {
			const elem = value.get(i);
			const parsed = parseSingleValueAsX(elem);
			if (parsed !== null) {
				result.push(parsed);
			}
		}
		return result.length > 0 ? result : null;
	}

	const single = parseSingleValueAsX(value);
	return single !== null ? [single] : null;
}
