import { cp, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(site, '../gallery');
const destination = resolve(site, 'docs/public/gallery');
const images = [
  '01-line.png', '02-bar.png', '03-area.png', '04-pie.png',
  '05-radar.png', '06-scatter.png', '07-color-palettes.png',
  '08-date-grouping.png', '09-data-details.png', '10-ai-chart.png',
  '11-dark.png', 'overview.png',
];
await Promise.all(images.map(image => access(resolve(source, 'images', image))));
const archive = 'bases-chart-views-gallery.zip';
await access(resolve(source, archive));
await mkdir(destination, { recursive: true });
await cp(resolve(source, 'images'), destination, { recursive: true });
await cp(resolve(source, archive), resolve(destination, archive));
