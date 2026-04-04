import type { App, Value } from 'obsidian';
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


export function getFileDisplayName(filePath: string): string {
	return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
}

// --- X axis type: one type, used everywhere ---

export type XAxisType = 'time' | 'value' | 'category';

/**
 * Read the Obsidian property widget and map directly to the ECharts axis type.
 *   date     → category  (date-only values are best shown as discrete labels)
 *   datetime → time      (ECharts continuous time axis)
 *   number   → value     (ECharts continuous numeric axis)
 *   others   → category
 */
export function detectXAxisType(app: App, propertyId: string): XAxisType {
	const manager = (app as unknown as Record<string, unknown>).metadataTypeManager as
		| { properties: Record<string, { widget?: string }> }
		| undefined;
	// Bases property IDs use a "note." prefix; metadataTypeManager uses bare lowercase names.
	const bare = propertyId.replace(/^note\./, '').toLowerCase();
	const widget = manager?.properties?.[bare]?.widget;
	if (widget === 'datetime') return 'time';
	if (widget === 'number') return 'value';
	return 'category';
}

// --- Value parsing ---

export function parseValueAsNumber(value: Value | null): number | null {
	if (!value) return null;
	if (value instanceof NumberValue) return value.data;
	if (value instanceof StringValue) {
		const parsed = parseFloat(value.data);
		return isNaN(parsed) ? null : parsed;
	}
	// Fallback for Value types not matched by instanceof
	const str = value.toString();
	if (str && str !== 'null') {
		const parsed = parseFloat(str);
		return isNaN(parsed) ? null : parsed;
	}
	return null;
}

export type XValue = number | Date | string;

/**
 * Parse a single Obsidian Value into an X axis value based on the axis type.
 *   category → always string (via toString)
 *   value    → always number
 *   time     → always Date
 */
function parseSingleValueAsX(value: Value, axisType: XAxisType): XValue | null {
	if (axisType === 'category') {
		// Category: always return a string for discrete axis labels
		if (value instanceof NumberValue) return String(value.data);
		if (value instanceof StringValue) return value.data;
		if (value instanceof DateValue) return value.toString();
		const str = value.toString();
		return (str && str !== 'null') ? str : null;
	}

	if (axisType === 'value') {
		// Value: always return a number for continuous numeric axis
		if (value instanceof NumberValue) return value.data;
		if (value instanceof StringValue) {
			const num = parseFloat(value.data);
			return isNaN(num) ? null : num;
		}
		const str = value.toString();
		if (str && str !== 'null') {
			const num = parseFloat(str);
			return isNaN(num) ? null : num;
		}
		return null;
	}

	// time: always return a Date for ECharts time axis
	if (value instanceof DateValue) return new Date(value.toString());
	if (value instanceof StringValue) {
		const date = new Date(value.data);
		return !isNaN(date.getTime()) ? date : null;
	}
	if (value instanceof NumberValue) return new Date(value.data);
	const str = value.toString();
	if (str && str !== 'null') {
		const date = new Date(str);
		return !isNaN(date.getTime()) ? date : null;
	}
	return null;
}

export function parseValueAsX(value: Value | null, axisType: XAxisType): XValue[] | null {
	if (!value) return null;

	if (value instanceof ListValue) {
		const result: XValue[] = [];
		for (let i = 0; i < value.length(); i++) {
			const elem = value.get(i);
			const parsed = parseSingleValueAsX(elem, axisType);
			if (parsed !== null) {
				result.push(parsed);
			}
		}
		return result.length > 0 ? result : null;
	}

	const single = parseSingleValueAsX(value, axisType);
	return single !== null ? [single] : null;
}
