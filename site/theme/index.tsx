import { DocContent, Layout as OriginalLayout } from '@rspress/core/theme-original';

export function Layout() {
  return <OriginalLayout afterHero={<main className="home-editorial rp-doc"><DocContent components={{}} isOverviewPage /></main>} />;
}

export * from '@rspress/core/theme-original';
