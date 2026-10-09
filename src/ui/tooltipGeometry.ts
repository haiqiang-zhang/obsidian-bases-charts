export function tooltipMetrics(width: number, height: number, fontSize = 13) {
	const rowHeight = Math.ceil(Math.max(13, fontSize) * 1.9);
	const maxHeight = Math.max(0, Math.min(280, Math.max(140, height * 0.5), height - 24));
	const headerAndFooter = Math.ceil(Math.max(13, fontSize) * 6.5) + 10;
	return {
		width: Math.max(0, Math.min(280, width - 24)),
		maxHeight,
		rowHeight,
		rowLimit: Math.max(0, Math.min(5, Math.floor((maxHeight - headerAndFooter) / rowHeight))),
	};
}

/** ECharts expects chart-local coordinates even when its tooltip is appended to body. */
export function positionTooltip(
	point: number[],
	contentSize: number[],
	chartRect: { left: number; top: number; width?: number; height?: number },
	viewport: { width: number; height: number },
	viewSize?: number[],
	horizontalGap = 16,
): number[] {
	const margin = 12;
	const [width, height] = contentSize;
	const scaleX = chartRect.width && viewSize?.[0] ? chartRect.width / viewSize[0] : 1;
	const scaleY = chartRect.height && viewSize?.[1] ? chartRect.height / viewSize[1] : 1;
	const px = chartRect.left + point[0] * scaleX;
	const py = chartRect.top + point[1] * scaleY;
	const clamp = (value: number, extent: number, size: number) =>
		Math.max(margin, Math.min(value, Math.max(margin, extent - size - margin)));
	const gap = 16;
	// Prefer a side of the hovered column. Vertical clamping is safe here because
	// the pointer remains outside the card horizontally, even in short windows.
	const right = px + horizontalGap;
	const left = px - width - horizontalGap;
	let x: number;
	let y: number;
	if (right + width <= viewport.width - margin || left >= margin) {
		x = right + width <= viewport.width - margin ? right : left;
		y = clamp(py - 40, viewport.height, height);
	} else {
		x = clamp(px - width / 2, viewport.width, width);
		const above = py - height - gap;
		const below = py + gap;
		y = above >= margin ? above : below + height <= viewport.height - margin
			? below : clamp(py > viewport.height / 2 ? above : below, viewport.height, height);
	}
	return [(x - chartRect.left) / scaleX, (y - chartRect.top) / scaleY];
}
