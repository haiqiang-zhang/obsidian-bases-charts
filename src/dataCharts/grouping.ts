import type { BasesEntry, BasesEntryGroup } from 'obsidian';

export interface ChartGroup {
	/** Position in the current Bases result, independent of its display label. */
	groupIndex: number;
	label: string;
	entries: BasesEntry[];
}

/**
 * Preserve the groups selected and ordered by Bases. Display strings are not
 * identities: a number, text, or missing value can have the same display label.
 */
export function prepareChartGroups(groups: readonly BasesEntryGroup[]): ChartGroup[] {
	const usedLabels = new Set<string>();
	return groups.map((group, groupIndex) => {
		const baseLabel = group.hasKey()
			? (group.key?.toString() || '(Empty)')
			: group.key === undefined ? 'All files' : '(No value)';
		let label = baseLabel;
		let suffix = 2;
		while (usedLabels.has(label)) {
			label = `${baseLabel} (${suffix++})`;
		}
		usedLabels.add(label);
		return { groupIndex, label, entries: group.entries };
	});
}
