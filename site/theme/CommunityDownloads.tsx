import downloads from '../data/community-downloads.json';

export function CommunityDownloads() {
  const checked = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(new Date(downloads.checkedAt));

  return <a className="home-downloads" href={downloads.source}
    title={`Download count reported by Obsidian Community · Checked ${checked}`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
    </svg>
    <span><strong>{downloads.downloads}</strong> downloads on Obsidian</span>
  </a>;
}
