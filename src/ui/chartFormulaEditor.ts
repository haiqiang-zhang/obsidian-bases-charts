import { Component, Notice } from 'obsidian';
import type { BasesPropertyId, QueryController } from 'obsidian';
import type { DataChartView } from '../dataCharts/dataChartView';
import { AggregateMode, aggregateKey } from '../dataCharts/aggregate';
import { COMMON_SETTINGS } from '../dataCharts/types';
import { parseValueAsNumber } from '../utils/utils';

interface NativeMenu {
	menuEl: HTMLElement;
	parentEl: HTMLElement;
	readonly isOpen: boolean;
	setOpen(open: boolean): void;
	setAutoDestroy(anchor: HTMLElement): void;
	pageStack?: { showEditPage?(property: BasesPropertyId, isNew?: boolean): void }[];
}

interface NativeQuery { formulas?: Record<string, unknown> }
interface NativeController {
	view?: unknown;
	query?: NativeQuery;
	propertyMenu?: { toolbarItem?: { enabled?: boolean; menu?: NativeMenu } };
}

interface EditorState { name: string; text: string; valid: boolean }

function formulaText(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
	return null;
}

/** Accept the native parser's result, never implement a second formula parser. */
function validFormula(value: unknown, state: EditorState | null): boolean {
	const text = formulaText(value)?.trim();
	if (!text) return false;
	if (value && typeof value === 'object' && 'formula' in value) {
		const ast = value.formula;
		if (ast && typeof ast === 'object' && 'type' in ast && typeof ast.type === 'string') {
			return ast.type !== 'invalid' && ast.type !== 'empty';
		}
	}
	// A future host may expose serialized strings instead of parser objects.
	return state?.valid === true && state.text.trim() === text;
}

/** Native Bases has no public property/formula editor API; keep this adapter isolated. */
export class ChartFormulaEditor extends Component {
	private cancelSession: (() => void) | null = null;
	private disposed = false;
	private pendingAggregates = new Set<() => void>();

	constructor(private view: DataChartView, private controller: QueryController) { super(); }

	private native(): { controller: NativeController; menu: NativeMenu; query: NativeQuery } | null {
		if (this.disposed) return null;
		const controller = this.controller as NativeController;
		const item = controller.propertyMenu?.toolbarItem;
		const menu = item?.menu;
		if (controller.view !== this.view || !controller.query || item?.enabled === false
			|| !menu || menu.menuEl?.nodeType !== 1 || !menu.parentEl
			|| typeof menu.setOpen !== 'function' || typeof menu.setAutoDestroy !== 'function'
			|| typeof menu.isOpen !== 'boolean') return null;
		return { controller, menu, query: controller.query };
	}

	canOpen(): boolean { return this.native() !== null; }

	private initializeYAggregate(propertyId: BasesPropertyId, query: NativeQuery): void {
		const config = this.view.config;
		const key = aggregateKey(propertyId);
		if (config.get(key) != null) return;
		const dataBefore = this.view.data;
		const controller = this.controller as NativeController;
		const stop = () => {
			this.view.events.offref(ref);
			this.pendingAggregates.delete(stop);
		};
		const ref = this.view.events.on('data-updated', () => {
			if (this.disposed || controller.view !== this.view || controller.query !== query
				|| this.view.config !== config || !this.view.getYProperties().includes(propertyId)
				|| !Object.hasOwn(query.formulas ?? {}, propertyId.slice('formula.'.length)) || config.get(key) != null) {
				stop();
				return;
			}
			// Formula edits start an asynchronous native query. Our own redraw event
			// still sees cached values; classify only the next native data snapshot.
			if (this.view.data === dataBefore) return;
			stop();
			const numeric = this.view.data.data.some(entry => parseValueAsNumber(entry.getValue(propertyId)) !== null);
			config.set(key, numeric ? this.view.getDefaultAggregateMode() : AggregateMode.COUNT);
			this.view.events.trigger('data-updated');
		});
		this.pendingAggregates.add(stop);
	}

	open(anchor: HTMLElement, axis: 'x' | 'y', propertyId?: BasesPropertyId): void {
		this.cancelSession?.();
		const editorName = propertyId && !propertyId.startsWith('formula.') ? 'property' : 'formula';
		const native = this.native();
		const win = anchor.ownerDocument.defaultView;
		if (!native || !win || !anchor.isConnected) {
			new Notice(`The native ${editorName} editor is unavailable in this Obsidian version.`);
			return;
		}
		if (propertyId && !/^(file|note|formula)\..+/.test(propertyId)) return;
		const { controller, menu, query } = native;
		const config = this.view.config;
		const originalX = config.getAsPropertyId(COMMON_SETTINGS.X);
		const before = new Set(Object.keys(query.formulas ?? {}));
		const oldName = propertyId?.startsWith('formula.') ? propertyId.slice('formula.'.length) : undefined;
		const originalAnchor = menu.parentEl;
		const doc = anchor.ownerDocument;
		let timer: number | undefined;
		let cancelled = false;
		let finishing = false;
		let rootPage: NonNullable<NativeMenu['pageStack']>[number] | undefined;
		let enteredEditor = false;
		let ownsSessionClass = false;
		let state: EditorState | null = null;
		let unwatchMigration: (() => void) | undefined;
		const stopWatchingMigration = () => {
			unwatchMigration?.();
			unwatchMigration = undefined;
		};
		const restoreAnchor = () => { if (menu.parentEl === anchor) menu.parentEl = originalAnchor; };
		const removeSessionClass = () => {
			if (ownsSessionClass) menu.menuEl.classList.remove('bases-chart-property-menu');
			ownsSessionClass = false;
		};
		const readEditorState = () => {
			const status = menu.menuEl.querySelector('.formula-editor-status');
			const input = menu.menuEl.querySelector<HTMLInputElement>('.bases-toolbar-menu-form input[type="text"]');
			const lines = menu.menuEl.querySelectorAll<HTMLElement>('.formula-editor .cm-line');
			if (status) state = {
				name: input?.value.trim() ?? '',
				text: Array.from(lines, line => line.textContent ?? '').join('\n'),
				valid: !status.classList.contains('mod-error') && !status.classList.contains('mod-empty'),
			};
		};
		const isCurrentSession = () => !cancelled && !this.disposed && !menu.isOpen
			&& controller.view === this.view && controller.query === query
			&& controller.propertyMenu?.toolbarItem?.menu === menu
			&& this.view.config === config && anchor.isConnected && anchor.ownerDocument === doc;
		const applySelection = () => {
			if (!isCurrentSession()) return;
			const formulas = query.formulas ?? {};
			const added = Object.keys(formulas).filter(name => !before.has(name));
			if (propertyId) {
				// Native file/note editors update their display name and property type.
				// Those edits must not select a formula created elsewhere meanwhile.
				if (!oldName) return;
				// Current Obsidian edits the display name only. If a later host renames
				// the actual key, follow only an unambiguous rename of this editor.
				if (Object.hasOwn(formulas, oldName)) return;
				const next = added.length === 1 && state?.name === added[0]
					? `formula.${added[0]}` as BasesPropertyId : null;
				let changed = false;
				if (config.getAsPropertyId(COMMON_SETTINGS.X) === propertyId) {
					config.set(COMMON_SETTINGS.X, next);
					changed = true;
				}
				const y = config.get(COMMON_SETTINGS.Y);
				if (Array.isArray(y) && y.includes(propertyId)) {
					// Native deletion updates reserved order, not our explicit axes.
					const values: unknown[] = next
						? y.map((id: unknown) => id === propertyId ? next : id)
						: y.filter((id: unknown) => id !== propertyId);
					config.set(COMMON_SETTINGS.Y, [...new Set(values)]);
					changed = true;
				}
				if (!changed) return;
			} else {
				if (added.length !== 1 || !validFormula(formulas[added[0]], state)) return;
				const next = `formula.${added[0]}` as BasesPropertyId;
				if (axis === 'x') {
					if (config.getAsPropertyId(COMMON_SETTINGS.X) !== originalX) return;
					config.set(COMMON_SETTINGS.X, next);
				} else {
					const y = this.view.getYProperties();
					if (!y.includes(next)) {
						this.initializeYAggregate(next, query);
						config.set(COMMON_SETTINGS.Y, [...y, next]);
					}
				}
			}
			this.view.events.trigger('data-updated');
		};
		const finish = (returnToAxis = false) => {
			if (finishing || cancelled) return;
			finishing = true;
			observer.disconnect();
			// Back/Escape has already let the native editor save and leave its page.
			// Close its Properties root before paint; that is not our parent panel.
			if (returnToAxis && menu.isOpen) menu.setOpen(false);
			restoreAnchor();
			removeSessionClass();
			// Native name and formula inputs save on blur, after the menu closes.
			timer = win.setTimeout(() => {
				timer = undefined;
				readEditorState();
				applySelection();
				stopWatchingMigration();
				if (this.cancelSession === cancel) this.cancelSession = null;
				if (returnToAxis && isCurrentSession()) this.view.openAxisSettings(axis);
			}, 0);
		};
		const observer = new win.MutationObserver(() => {
			readEditorState();
			if (!menu.isOpen || !menu.menuEl.isConnected) finish();
			else if (enteredEditor && menu.parentEl === anchor
				&& menu.pageStack?.length === 1 && menu.pageStack[0] === rootPage) finish(true);
		});
		const cancel = () => {
			if (cancelled) return;
			cancelled = true;
			observer.disconnect();
			stopWatchingMigration();
			if (timer !== undefined) win.clearTimeout(timer);
			if (menu.parentEl === anchor && menu.isOpen) menu.setOpen(false);
			restoreAnchor();
			removeSessionClass();
			if (this.cancelSession === cancel) this.cancelSession = null;
		};
		this.cancelSession = cancel;
		try {
			if (menu.isOpen) menu.setOpen(false);
			menu.parentEl = anchor;
			ownsSessionClass = !menu.menuEl.classList.contains('bases-chart-property-menu');
			if (ownsSessionClass) menu.menuEl.classList.add('bases-chart-property-menu');
			menu.setAutoDestroy(anchor);
			menu.setOpen(true);
			rootPage = menu.pageStack?.[0];
			observer.observe(doc.body, { childList: true });
			observer.observe(menu.menuEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
			if (typeof anchor.onWindowMigrated === 'function') unwatchMigration = anchor.onWindowMigrated(cancel);
			if (propertyId) {
				const page = menu.pageStack?.[0];
				if (typeof page?.showEditPage !== 'function'
					|| (oldName !== undefined && !Object.hasOwn(query.formulas ?? {}, oldName))) throw new Error('Property editor unavailable');
				page.showEditPage(propertyId, false);
			} else {
				const action = Array.from(menu.menuEl.querySelectorAll<HTMLElement>('.bases-toolbar-menu-item'))
					.find(row => !row.classList.contains('mod-formula') && row.querySelector('.lucide-square-function'));
				if (!action) throw new Error('Add formula action unavailable');
				// The native action adds the formula to reserved `order`. Preserve
				// legacy Y selection before this side effect, using our public setting.
				if (!Array.isArray(config.get(COMMON_SETTINGS.Y))) config.set(COMMON_SETTINGS.Y, [...this.view.getYProperties()]);
				action.click();
			}
			enteredEditor = rootPage !== undefined && (menu.pageStack?.length ?? 0) > 1;
			readEditorState();
		} catch (error) {
			cancel();
			console.warn(`Unable to open the native Bases ${editorName} editor`, error);
			new Notice(`Unable to open the native ${editorName} editor. Existing properties are still available in the property list.`);
		}
	}

	onload(): void { this.disposed = false; }
	onunload(): void {
		this.disposed = true;
		this.cancelSession?.();
		for (const stop of this.pendingAggregates) stop();
	}
}
