export interface TooltipBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function tooltipMetrics(width: number, height: number, fontSize = 13, available?: TooltipBounds | null) {
	const rowHeight = Math.ceil(Math.max(13, fontSize) * 1.9);
	const maxHeight = Math.max(0, Math.min(280, Math.max(140, height * 0.5), height - 24, available?.height ?? Infinity));
	const headerAndFooter = Math.ceil(Math.max(13, fontSize) * 6.5) + 10;
	return {
		width: Math.max(0, Math.min(260, width - 24, available?.width ?? Infinity)),
		maxHeight,
		rowHeight,
		rowLimit: Math.max(0, Math.min(5, Math.floor((maxHeight - headerAndFooter) / rowHeight))),
	};
}

/** Find a rectangular Cartesian plot through the public ECharts hit-test API. */
export function findPlotBounds(width: number, height: number, contains: (point: number[]) => boolean): TooltipBounds | null {
	if (width <= 0 || height <= 0) return null;
	let seed: number[] | undefined;
	for (const y of [0.5, 0.25, 0.75]) {
		for (const x of [0.5, 0.25, 0.75]) {
			const point = [width * x, height * y];
			if (contains(point)) { seed = point; break; }
		}
		if (seed) break;
	}
	if (!seed) return null;
	const edge = (axis: number, outside: number) => {
		let inside = seed[axis];
		while (Math.abs(inside - outside) > 0.25) {
			const value = (inside + outside) / 2;
			const point = [...seed];
			point[axis] = value;
			if (contains(point)) inside = value;
			else outside = value;
		}
		return inside;
	};
	const left = edge(0, -1);
	const right = edge(0, width + 1);
	const top = edge(1, -1);
	const bottom = edge(1, height + 1);
	return { left, top, width: right - left, height: bottom - top };
}

/** Visible plot area in viewport pixels, leaving axes, legends and the header outside. */
export function visibleTooltipBounds(
	plot: TooltipBounds,
	chartRect: { left: number; top: number; width?: number; height?: number },
	viewport: { width: number; height: number },
	viewSize?: number[],
	clip?: { left: number; top: number; right: number; bottom: number } | null,
): TooltipBounds {
	const scaleX = chartRect.width && viewSize?.[0] ? chartRect.width / viewSize[0] : 1;
	const scaleY = chartRect.height && viewSize?.[1] ? chartRect.height / viewSize[1] : 1;
	const left = Math.max(12, chartRect.left + plot.left * scaleX + 8, clip?.left ?? -Infinity);
	const top = Math.max(12, chartRect.top + plot.top * scaleY + 8, clip?.top ?? -Infinity);
	const right = Math.min(viewport.width - 12, chartRect.left + (plot.left + plot.width) * scaleX - 8, clip?.right ?? Infinity);
	const bottom = Math.min(viewport.height - 12, chartRect.top + (plot.top + plot.height) * scaleY - 8, clip?.bottom ?? Infinity);
	return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** ECharts expects chart-local coordinates even when its tooltip is appended to body. */
export function positionTooltip(
	point: number[],
	contentSize: number[],
	chartRect: { left: number; top: number; width?: number; height?: number },
	viewport: { width: number; height: number },
	viewSize?: number[],
	horizontalGap = 16,
	plotBounds?: TooltipBounds | null,
): number[] {
	const margin = 12;
	const [width, height] = contentSize;
	const scaleX = chartRect.width && viewSize?.[0] ? chartRect.width / viewSize[0] : 1;
	const scaleY = chartRect.height && viewSize?.[1] ? chartRect.height / viewSize[1] : 1;
	const px = chartRect.left + point[0] * scaleX;
	const py = chartRect.top + point[1] * scaleY;
	const area = plotBounds ?? { left: margin, top: margin, width: viewport.width - margin * 2, height: viewport.height - margin * 2 };
	const rightEdge = area.left + area.width;
	const bottomEdge = area.top + area.height;
	const clampX = (value: number) => Math.max(area.left, Math.min(value, rightEdge - width));
	const clampY = (value: number) => Math.max(area.top, Math.min(value, bottomEdge - height));
	const gap = 16;
	const above = py - height - gap;
	const right = px + horizontalGap;
	const left = px - width - horizontalGap;
	let x: number;
	let y: number;
	if (plotBounds && above >= area.top) {
		x = clampX(px - width / 2);
		y = Math.min(above, bottomEdge - height);
	} else if (right + width <= rightEdge || left >= area.left) {
		x = right + width <= rightEdge ? right : left;
		y = clampY(py - 40);
	} else {
		x = clampX(px - width / 2);
		const below = py + gap;
		y = above >= area.top ? above : below + height <= bottomEdge
			? below : clampY(py > area.top + area.height / 2 ? above : below);
	}
	return [(x - chartRect.left) / scaleX, (y - chartRect.top) / scaleY];
}
