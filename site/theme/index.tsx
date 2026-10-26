import { normalizeImagePath } from '@rspress/core/runtime';
import { DocContent, HomeHero as OriginalHomeHero, Layout as OriginalLayout, type HomeHeroProps } from '@rspress/core/theme-original';

const homeCharts = [
  {
    image: '03-area.png',
    title: 'Weekly hours',
    detail: 'Stacked area · Four workstreams',
    alt: 'A stacked area chart of weekly hours across Design, Engineering, Research, and Writing, grouped by week in the native Bases toolbar.',
  },
  {
    image: '02-bar.png',
    title: 'Project comparison',
    detail: 'Grouped bar chart',
    alt: 'A grouped bar chart comparing hours for six projects, with separate bars for Design, Engineering, Research, and Writing.',
  },
  {
    image: '04-pie.png',
    title: 'Hours by workstream',
    detail: 'Pie chart',
    alt: 'A pie chart showing the share of hours for Design, Engineering, Research, and Writing, with percentage labels.',
  },
];

export function HomeHero(props: HomeHeroProps) {
  return <OriginalHomeHero {...props} image={
    <div className="home-chart-composition" aria-label="Chart view examples">
      {homeCharts.map((chart, index) => (
        <figure className={`home-chart-card${index === 0 ? ' home-chart-card--primary' : ''}`} key={chart.image}>
          <img src={normalizeImagePath(`/gallery/${chart.image}`)} alt={chart.alt} width={1720} height={888} />
          <figcaption>
            <span>{chart.title}</span>
            <span>{chart.detail}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  } />;
}

export function Layout() {
  return <OriginalLayout afterHero={<main className="home-editorial rp-doc"><DocContent components={{}} isOverviewPage /></main>} />;
}

export * from '@rspress/core/theme-original';
