import { cp, mkdir, access, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(site, '../gallery');
const destination = resolve(site, 'docs/public/gallery');
const images = [
  '01-line.png', '02-bar.png', '03-area.png', '04-pie.png',
  '05-radar.png', '06-scatter.png', '07-color-palettes.png',
  '08-date-grouping.png', '09-data-details.png', '10-ai-chart.png',
  '11-dark.png', '12-multiple-measures.png', '13-formula-editor.png',
  '14-column-hover.png', 'overview.png',
];
await Promise.all(images.map(image => access(resolve(source, 'images', image))));
const manifestName = 'capture-manifest.json';
const manifest = JSON.parse(await readFile(resolve(source, manifestName), 'utf8'));
const captures = new Map(manifest.captures.map(capture => [capture.file, capture]));
if (manifest.capture_count !== images.length || captures.size !== images.length) {
  throw new Error('Gallery manifest must contain exactly the 15 required screenshots. Rebuild the gallery package.');
}
await Promise.all(images.map(async image => {
  const capture = captures.get(image);
  const bytes = await readFile(resolve(source, 'images', image));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!capture || capture.sha256 !== hash) {
    throw new Error(`Gallery manifest is stale for ${image}. Rebuild the gallery package.`);
  }
}));
await mkdir(destination, { recursive: true });
await cp(resolve(source, 'images'), destination, { recursive: true });
await rm(resolve(destination, 'bases-chart-views-gallery.zip'), { force: true });
await cp(resolve(source, manifestName), resolve(destination, manifestName));
const examples = resolve(site, 'docs/public/examples');
await mkdir(examples, { recursive: true });
await cp(resolve(site, '../images/ai-charts.png'), resolve(examples, 'ai-charts.png'));

// Mobile captures have their own manifest and remain separate from the desktop set.
const mobileSource = resolve(source, 'mobile');
const mobileDestination = resolve(site, 'docs/public/mobile-gallery');
const mobileImages = [
  '01-line.png', '02-bar.png', '03-area.png', '04-pie.png',
  '05-radar.png', '06-scatter.png', '07-date-grouping.png',
  '08-y-properties.png', '09-color-palettes.png', '10-data-drawer.png',
  '11-multiple-measures.png', '12-dark.png', '13-touch-preview.png', '14-landscape.png',
];
const mobileManifest = JSON.parse(await readFile(resolve(mobileSource, manifestName), 'utf8'));
const mobileCaptures = new Map(mobileManifest.captures.map(capture => [capture.file, capture]));
if (mobileManifest.capture_count !== mobileImages.length || mobileCaptures.size !== mobileImages.length) {
  throw new Error('Mobile gallery manifest must contain exactly the 14 required screenshots. Rebuild the mobile gallery package.');
}
await Promise.all(mobileImages.map(async image => {
  const capture = mobileCaptures.get(image);
  const bytes = await readFile(resolve(mobileSource, 'images', image));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!capture || capture.sha256 !== hash) {
    throw new Error(`Mobile gallery manifest is stale for ${image}. Rebuild the mobile gallery package.`);
  }
}));
await mkdir(mobileDestination, { recursive: true });
await Promise.all(mobileImages.map(image => cp(resolve(mobileSource, 'images', image), resolve(mobileDestination, image))));
await cp(resolve(mobileSource, manifestName), resolve(mobileDestination, manifestName));
