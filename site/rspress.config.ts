import { defineConfig } from '@rspress/core';

const repository = 'https://github.com/haiqiang-zhang/obsidian-bases-charts';

export default defineConfig({
  title: 'Bases Chart Views',
  description: 'Chart views for Obsidian Bases. Documentation for chart types, axes, date grouping, aggregation, palettes, and source-file details.',
  base: '/obsidian-bases-charts/',
  root: 'docs',
  outDir: 'build',
  themeDir: 'theme',
  logo: '/logo.svg',
  logoText: 'Bases Chart Views',
  icon: '/logo.svg',
  // Rspress requires absolute paths for injected style and component modules.
  globalStyles: `${import.meta.dirname}/theme/styles.css`,
  globalUIComponents: [`${import.meta.dirname}/theme/GalleryLightbox.tsx`],
  mediumZoom: false,
  head: [
    ['meta', { property: 'og:image', content: 'https://haiqiang-zhang.github.io/obsidian-bases-charts/gallery/overview.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  markdown: { showLineNumbers: true },
  search: { mode: 'local' },
  themeConfig: {
    nav: [
      { text: 'Docs', link: '/overview' },
      { text: 'UI Gallery', link: '/screenshots' },
      { text: 'Mobile UI', link: '/mobile-gallery' },
      { text: 'GitHub', link: repository },
    ],
    sidebar: {
      '/': [
        { text: 'Start here', items: [
          { text: 'Overview', link: '/overview' },
          { text: 'Installation', link: '/installation' },
          { text: 'UI Gallery', link: '/screenshots' },
          { text: 'Mobile UI gallery', link: '/mobile-gallery' },
        ] },
        { text: 'Build a chart', items: [
          { text: 'Chart types', link: '/chart-types' },
          { text: 'Axes, formulas & dates', link: '/axes-and-dates' },
          { text: 'Groups & aggregation', link: '/groups-and-aggregation' },
          { text: 'Colors & layout', link: '/colors-and-layout' },
          { text: 'Explore source data', link: '/explore-data' },
        ] },
        { text: 'Go further', items: [
          { text: 'AI Charts', link: '/ai-charts' },
        ] },
      ],
    },
    editLink: { docRepoBaseUrl: `${repository}/edit/master/site/docs` },
    lastUpdated: true,
    search: true,
    socialLinks: [{ icon: 'github', mode: 'link', content: repository }],
    footer: { message: '© 2026 Haiqiang Zhang · Bases Chart Views · GPL-3.0' },
  },
});
