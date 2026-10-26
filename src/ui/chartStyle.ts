/** Embedded Bases can render before their container joins the document. */
export function getChartStyle(containerEl: HTMLElement): CSSStyleDeclaration {
	return containerEl.win.getComputedStyle(containerEl.isConnected ? containerEl : containerEl.doc.body);
}
