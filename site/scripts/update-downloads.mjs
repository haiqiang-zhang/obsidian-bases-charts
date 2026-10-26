import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://community.obsidian.md/plugins/bases-chart-views';
const snapshot = new URL('../data/community-downloads.json', import.meta.url);

try {
  const response = await fetch(source, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Community listing returned ${response.status}`);
  const html = await response.text();
  if (!html.includes(`<link rel="canonical" href="${source}"`)) {
    throw new Error('Unexpected Community listing');
  }

  // Keep Obsidian's published label: "15k" is rounded, not an exact 15,000.
  // The download icon identifies the header statistic, excluding README text.
  const match = html.match(/class="[^"]*\blucide-cloud-download\b[^"]*"[^>]*>[\s\S]*?<\/svg>\s*([0-9][0-9,.]*(?:[kmb])?)(?:<!--[\s\S]*?-->|\s|&nbsp;)*downloads\b/i);
  if (!match) throw new Error('Community download count was not found');
  const data = {
    pluginId: 'bases-chart-views',
    downloads: match[1],
    checkedAt: new Date().toISOString(),
    source,
  };
  await writeFile(snapshot, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Obsidian Community: ${data.downloads} downloads`);
} catch (error) {
  // CI must not replace a newer deployed count with the committed fallback.
  if (process.env.REQUIRE_COMMUNITY_DOWNLOADS === 'true') throw error;
  // The checked-in snapshot keeps offline builds usable and records its age.
  const previous = JSON.parse(await readFile(snapshot, 'utf8'));
  if (previous.pluginId !== 'bases-chart-views' || previous.source !== source
    || !/^[0-9][0-9,.]*[kmb]?$/i.test(previous.downloads)
    || !Number.isFinite(Date.parse(previous.checkedAt))) {
    throw new Error('No valid Community download snapshot is available', { cause: error });
  }
  console.warn(`Could not refresh Obsidian downloads; keeping ${previous.downloads} from ${previous.checkedAt}.`, error.message);
}
