<script lang="ts">
	import { AxisX, AxisY, BarY, GridY, Plot, Pointer, Text } from 'svelteplot';
	import { CHART_SETTINGS, ChartView } from '../ChartView';
	import { onMount } from 'svelte';
	import { toCompactString } from '../utils/utils';
	import PlotGrid from './PlotGrid.svelte';

	interface Props {
		view: ChartView;
	}

	let { view }: Props = $props();

	let show_labels: boolean = $state(true);
	let show_percentages: boolean = $state(false);
	let hasDomainOverride: boolean = $state(false);

	function onUpdate() {
		show_labels = Boolean(view.config?.get(CHART_SETTINGS.SHOW_LABELS) ?? true);
		show_percentages = Boolean(view.config?.get(CHART_SETTINGS.SHOW_PERCENTAGES) ?? false);
		hasDomainOverride = view.hasDomainOverride();
	}

	onMount(() => {
		view.events.on('data-updated', onUpdate);

		return () => {
			view.events.off('data-updated', onUpdate);
		};
	});
</script>

<PlotGrid view={view}>
	{#snippet chartSnippet({ data, chartIndex, xName, groupFn, height, setHoveredData })}
		{@const yLabel = view.getYAxisLabel(data.getChartName(chartIndex))}
		{@const domain = hasDomainOverride ? data.getYDomainForChart(chartIndex) : undefined}
		<Plot
			x={{ label: xName, type: 'band' }}
			y={{ label: yLabel, domain, tickFormat: show_percentages ? d => `${String(d)}%` : d => toCompactString(d) }}
			height={height}
			class="bases-charts-plot"
		>
			<AxisX fill="var(--bases-charts-text)" stroke="var(--bases-charts-text)" opacity={1} removeDuplicateTicks />
			<AxisY fill="var(--bases-charts-text)" stroke="var(--bases-charts-text)" opacity={1} />
			<GridY stroke="var(--bases-charts-grid)" strokeOpacity={1} />

			{@const yDomain = data.getYDomainForChart(chartIndex)}
			<Pointer data={data.getFlat(chartIndex)} x="x" maxDistance={Infinity} onupdate={setHoveredData}>
				{#snippet children({ data: hovered })}
					<BarY data={hovered} x="x" y1={domain ? domain[0] : 0} y2={yDomain[1]} fill="var(--bases-charts-grid)" opacity={0.5} />
				{/snippet}
			</Pointer>
			<BarY data={data.getFlat(chartIndex)} x="x" y1={domain ? domain[0] : 0} y2="y" fill={groupFn} cursor="pointer" />
			{#if show_labels}
				<Text
					data={data.getStacked(chartIndex)}
					x="x"
					y="y"
					fill="var(--bases-charts-text)"
					text={d => (show_percentages ? `${d.y.toFixed(1)}%` : toCompactString(d.y))}
					lineAnchor="bottom"
					dy={-5}
				/>
			{/if}
		</Plot>
	{/snippet}
</PlotGrid>
