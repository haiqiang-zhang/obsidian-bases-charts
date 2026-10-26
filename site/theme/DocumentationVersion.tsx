import manifest from '../../manifest.json';

export function DocumentationVersion() {
  return <p>
    These docs cover <strong>Bases Chart Views {manifest.version}</strong>. See{' '}
    <a href={`https://github.com/haiqiang-zhang/obsidian-bases-charts/releases/tag/${manifest.version}`}>release notes</a>{' '}
    for changes in this version.
  </p>;
}

export function MinimumObsidianVersion() {
  return <strong>Obsidian {manifest.minAppVersion} or later</strong>;
}
