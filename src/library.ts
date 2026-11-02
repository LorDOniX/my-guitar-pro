export interface LibraryAsset {
  name: string;
  url: string;
}

export interface LibraryItem {
  id: string;
  label: string;
  artist: string;
  title: string;
  tab: LibraryAsset;
  video?: LibraryAsset;
  config?: LibraryAsset;
}

export function buildLibrary(files: Record<string, string>): LibraryItem[] {
  const folders = new Map<string, LibraryAsset[]>();
  for (const [path, url] of Object.entries(files)) {
    const relative = path.replaceAll('\\', '/').replace(/^\.\.\/items\//, '');
    const separator = relative.lastIndexOf('/');
    if (separator < 0) continue;
    const folder = relative.slice(0, separator);
    const assets = folders.get(folder) ?? [];
    assets.push({ name: relative.slice(separator + 1), url });
    folders.set(folder, assets);
  }
  const items: LibraryItem[] = [];
  for (const [id, assets] of folders) {
    assets.sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }));
    const pick = (pattern: RegExp, preferred: RegExp) => assets.find((asset) => preferred.test(asset.name)) ?? assets.find((asset) => pattern.test(asset.name));
    const tab = pick(/\.(gp[345]?|gpx)$/i, /^tab\.(gp[345]?|gpx)$/i);
    if (!tab) continue;
    const label = id.split('/').at(-1)!;
    const separator = label.indexOf(' - ');
    items.push({
      id, label,
      artist: separator < 0 ? '' : label.slice(0, separator),
      title: separator < 0 ? label : label.slice(separator + 3),
      tab,
      video: pick(/\.(mp4|m4v|webm|mov|ogv)$/i, /^video\.(mp4|m4v|webm|mov|ogv)$/i),
      config: pick(/\.json$/i, /^config\.json$/i),
    });
  }
  return items.sort((a, b) => a.label.localeCompare(b.label, 'cs', { numeric: true }));
}
