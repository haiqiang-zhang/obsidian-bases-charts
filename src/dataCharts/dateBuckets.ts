import type { App, Value } from 'obsidian';
import { DateValue, ListValue, NumberValue, StringValue } from 'obsidian';

export const DATE_GROUPING_OPTIONS = {
	exact: 'Exact time',
	day: 'Day',
	week: 'Week',
	month: 'Month',
	year: 'Year',
} as const;

export type DateGrouping = keyof typeof DATE_GROUPING_OPTIONS;
type CalendarGrouping = Exclude<DateGrouping, 'exact'>;
interface CalendarDate { year: number; month: number; day: number }

export function normalizeDateGrouping(value: unknown): DateGrouping {
	return typeof value === 'string' && Object.hasOwn(DATE_GROUPING_OPTIONS, value)
		? value as DateGrouping : 'exact';
}

/** Accept the ISO forms used by Obsidian, without JS's permissive date guessing. */
function parseCalendarDate(input: string): CalendarDate | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(input.trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return null;
	const hour = Number(match[4] ?? 0);
	const minute = Number(match[5] ?? 0);
	const second = Number(match[6] ?? 0);
	if (hour > 23 || minute > 59 || second > 59) return null;
	const zone = match[8];
	// A date-only or floating local datetime already identifies its calendar day.
	// Constructing Date from YYYY-MM-DD would incorrectly interpret it as UTC.
	if (!zone) return { year, month, day };
	let normalizedZone = 'Z';
	if (zone.toUpperCase() !== 'Z') {
		const digits = zone.slice(1).replace(':', '');
		const zoneHour = Number(digits.slice(0, 2));
		const zoneMinute = Number(digits.slice(2) || 0);
		if (zoneHour > 23 || zoneMinute > 59) return null;
		normalizedZone = `${zone[0]}${digits.slice(0, 2)}:${String(zoneMinute).padStart(2, '0')}`;
	}
	const milliseconds = (match[7] ?? '').slice(0, 3).padEnd(3, '0');
	const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${String(second).padStart(2, '0')}.${milliseconds}${normalizedZone}`);
	return calendarFromDate(date);
}

function calendarFromDate(date: Date): CalendarDate | null {
	return Number.isFinite(date.getTime())
		? { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
		: null;
}

function calendarFromValue(value: Value | null, propertyId?: string): CalendarDate | null {
	if (value instanceof DateValue || value instanceof StringValue) return parseCalendarDate(value.toString());
	// Built-in file timestamps are explicitly milliseconds. Arbitrary numbers
	// and numeric formula values must not be guessed to be dates.
	if (value instanceof NumberValue && (propertyId === 'file.ctime' || propertyId === 'file.mtime')) {
		return calendarFromDate(new Date(value.data));
	}
	return null;
}

function* scalarValues(value: Value | null): Generator<Value | null> {
	if (value instanceof ListValue) {
		for (let i = 0; i < value.length(); i++) yield* scalarValues(value.get(i));
	} else yield value;
}

/** Whether the X picker can meaningfully offer calendar grouping. */
export function isDateProperty(app: App, propertyId: string, values: Iterable<Value | null> = []): boolean {
	if (propertyId === 'file.ctime' || propertyId === 'file.mtime') return true;
	if (propertyId.startsWith('note.')) {
		const manager = (app as unknown as { metadataTypeManager?: { properties: Record<string, { widget?: string }> } }).metadataTypeManager;
		const widget = manager?.properties?.[propertyId.slice(5).toLowerCase()]?.widget;
		if (widget === 'date' || widget === 'datetime') return true;
	}
	for (const value of values) {
		for (const scalar of scalarValues(value)) {
			if (calendarFromValue(scalar, propertyId)) return true;
		}
	}
	return false;
}

function calendarKey(date: CalendarDate): string {
	return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function bucketKey(date: CalendarDate, grouping: CalendarGrouping): string {
	if (grouping === 'year') return String(date.year).padStart(4, '0');
	if (grouping === 'month') return calendarKey(date).slice(0, 7);
	if (grouping === 'week') {
		// Operate on calendar components in UTC, not elapsed local milliseconds,
		// so weeks stay Monday-based across DST and year boundaries.
		const monday = new Date(0);
		monday.setUTCFullYear(date.year, date.month - 1, date.day);
		monday.setUTCHours(12, 0, 0, 0);
		monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
		return calendarKey({ year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() });
	}
	return calendarKey(date);
}

/** Bucket before aggregation; an entry contributes at most once to each bucket. */
export function bucketDateValues(value: Value | null, grouping: CalendarGrouping, propertyId?: string): string[] | null {
	const buckets = new Set<string>();
	for (const scalar of scalarValues(value)) {
		const date = calendarFromValue(scalar, propertyId);
		if (date) buckets.add(bucketKey(date, grouping));
	}
	return buckets.size ? [...buckets] : null;
}
