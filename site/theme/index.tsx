import { normalizeImagePath } from '@rspress/core/runtime';
import { DocContent, HomeHero as OriginalHomeHero, Layout as OriginalLayout, type HomeHeroProps } from '@rspress/core/theme-original';
import { useLayoutEffect, useRef, useState } from 'react';

const homeFeatures = [
  {
    image: 'overview.png',
    label: 'Tooltips',
    title: 'Inspect chart values',
    detail: 'Anchored summaries for the selected week',
    alt: 'Weekly hours grouped by workstream, with an anchored tooltip showing the selected week’s values and a click-to-view-data action.',
    width: 1720,
    height: 888,
    icon: 'M4 3h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM6 7h8M6 10h5',
  },
  {
    image: '09-data-details.png',
    label: 'Data details',
    title: 'Open the source files',
    detail: 'Search the notes behind a chart value',
    alt: 'A searchable source-file table over its chart, listing the eight notes, workstreams, and hours contributing to the selected week.',
    width: 2240,
    height: 1618,
    icon: 'M3 4h14v12H3ZM3 8h14M8 8v8M3 12h14',
  },
  {
    image: '02-bar.png',
    label: 'Groups',
    title: 'Compare groups',
    detail: 'Workstreams within each project',
    alt: 'Project hours split into Design, Engineering, Research, and Writing, using the native Bases Group setting and a shared color legend.',
    width: 1720,
    height: 888,
    icon: 'M3 3h5v5H3ZM12 3h5v5h-5ZM3 12h5v5H3ZM12 12h5v5h-5Z',
  },
  {
    image: '07-color-palettes.png',
    label: 'Colors',
    title: 'Set colors for each view',
    detail: 'Named palettes with color previews',
    alt: 'The view settings and color palette menu over a chart, showing Colorful, Auto, Earth, Coastal, and single-color palettes with swatches.',
    width: 1720,
    height: 1166,
    icon: 'M10 2a8 8 0 1 0 0 16h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 .8-2.8H15a3 3 0 0 0 3-3C18 5 14.5 2 10 2ZM6 7h.01M10 5h.01M14 7h.01M5 11h.01',
  },
];

export function HomeHero(props: HomeHeroProps) {
  const [order, setOrder] = useState(() => homeFeatures.map((_, index) => index));
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const motion = useRef<{ from: Keyframe[]; outgoing: number } | null>(null);
  const selected = order[0];
  const chart = homeFeatures[selected];

  function selectFeature(index: number) {
    if (index === selected) return;
    // Capture the rendered positions before cancelling an interrupted slide.
    motion.current = {
      outgoing: selected,
      from: frames.current.map(frame => {
        if (!frame) return {};
        const style = window.getComputedStyle(frame);
        return { transform: style.transform, opacity: style.opacity, zIndex: style.zIndex };
      }),
    };
    frames.current.forEach(frame => frame?.getAnimations().forEach(animation => animation.cancel()));
    setOrder([index, ...order.filter(item => item !== index)]);
  }

  useLayoutEffect(() => {
    const transition = motion.current;
    if (!transition) return;
    motion.current = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;
    const animations: Animation[] = [];
    frames.current.forEach((frame, index) => {
      if (!frame) return;
      const style = window.getComputedStyle(frame);
      const destination = { transform: style.transform, opacity: style.opacity, zIndex: style.zIndex };
      const from = transition.from[index];
      let keyframes: Keyframe[] = [from, destination];
      if (index === selected) {
        keyframes = [from, {
          transform: 'translate(3%, -32px) scale(.97) rotate(1deg)',
          opacity: 1, zIndex: 5, offset: 0.48,
        }, { ...destination, zIndex: 5 }];
      } else if (index === transition.outgoing) {
        const aside = 'translate(-3%, 10px) scale(.97) rotate(-1deg)';
        keyframes = [{ ...from, zIndex: 6 },
          { transform: aside, opacity: 1, zIndex: 6, offset: 0.48 },
          { transform: aside, opacity: 1, zIndex: destination.zIndex, offset: 0.49 },
          destination];
      }
      animations.push(frame.animate(keyframes, { duration: 620, easing: 'cubic-bezier(.22,.68,.25,1)' }));
    });
    const stop = () => animations.forEach(animation => animation.cancel());
    reducedMotion.addEventListener('change', stop);
    return () => {
      stop();
      reducedMotion.removeEventListener('change', stop);
    };
  }, [order, selected]);

  return <OriginalHomeHero {...props} image={
    <div className="home-chart-composition" aria-label="Plugin feature examples">
      <div className="home-chart-picker" role="group" aria-label="Choose a feature example">
        {homeFeatures.map((example, index) => (
          <button type="button" key={example.image} aria-pressed={selected === index}
            onClick={() => selectFeature(index)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={example.icon} />
            </svg>
            {example.label}
          </button>
        ))}
      </div>
      <div className="home-chart-stack" aria-label="Feature screenshots">
        {homeFeatures.map((example, index) => (
          <div className="home-chart-frame" key={example.image}
            ref={element => { frames.current[index] = element; }}
            data-depth={order.indexOf(index)} inert={selected !== index} aria-hidden={selected !== index}>
            <figure className="home-chart-card">
              <div className="home-chart-media">
                <img src={normalizeImagePath(`/gallery/${example.image}`)} alt={example.alt}
                  width={example.width} height={example.height} draggable={false} />
              </div>
              <figcaption>
                <span className="home-chart-caption"><strong>{example.title}</strong><span>{example.detail}</span></span>
                <span className="home-chart-index" aria-hidden="true">0{index + 1} <span>/ 04</span></span>
              </figcaption>
            </figure>
          </div>
        ))}
      </div>
      <span className="home-chart-announcement" aria-live="polite" aria-atomic="true">{chart.label}: {chart.title}</span>
    </div>
  } />;
}

export function Layout() {
  return <OriginalLayout afterHero={<main className="home-editorial rp-doc"><DocContent components={{}} isOverviewPage /></main>} />;
}

export * from '@rspress/core/theme-original';
