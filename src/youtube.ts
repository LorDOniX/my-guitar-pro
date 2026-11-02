export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  getVolume(): number;
  setVolume(volume: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YouTubeOptions {
  events: {
    onReady(event: { target: YouTubePlayer }): void;
    onStateChange(event: { data: number }): void;
    onPlaybackRateChange(event: { data: number }): void;
    onError(event: { data: number }): void;
    onAutoplayBlocked(): void;
  };
}

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: YouTubeOptions) => YouTubePlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | undefined;

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('YouTube API neodpovídá. Zkontroluj připojení nebo blokování externích skriptů.')), 15000);
    window.onYouTubeIframeAPIReady = () => { finish(); previous?.(); };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => finish(new Error('YouTube API se nepodařilo stáhnout.'));
    document.head.append(script);
  }).catch((error: unknown) => { apiPromise = undefined; throw error; });
  return apiPromise;
}

export function youtubeEmbedUrl(videoId: string, origin: string): string {
  const url = new URL(`https://www.youtube.com/embed/${parseVideoId(videoId)}`);
  url.search = new URLSearchParams({
    enablejsapi: '1', origin, autoplay: '0', playsinline: '1',
    controls: '0', disablekb: '1', rel: '0', fs: '0',
    cc_load_policy: '0', iv_load_policy: '3', start: '0',
  }).toString();
  return url.href;
}

export function createYouTubeIframe(videoId: string, origin: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.id = 'youtube-player';
  frame.title = 'YouTube video';
  frame.width = '640';
  frame.height = '360';
  frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.src = youtubeEmbedUrl(videoId, origin);
  return frame;
}

export function createYouTubePlayer(element: HTMLIFrameElement, options: YouTubeOptions): YouTubePlayer {
  if (!window.YT?.Player) throw new Error('YouTube API není připravené.');
  return new window.YT.Player(element, options);
}

export function parseVideoId(value: string): string {
  const input = value.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Neplatný YouTube odkaz.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Zadej platný YouTube odkaz nebo ID videa.');
  return id;
}

interface SyncConfigBase {
  version: 4;
  tabFile: string;
  offsetSeconds: number;
}

interface YouTubeSyncConfig extends SyncConfigBase {
  source: 'youtube';
  videoId: string;
}

interface LocalSyncConfig extends SyncConfigBase {
  source: 'local';
  tabFile: string;
  mediaFile: string;
  offsetSeconds: number;
}

interface SynthSyncConfig extends SyncConfigBase {
  source: 'synth';
}

export type SyncConfig = YouTubeSyncConfig | LocalSyncConfig | SynthSyncConfig;

export function parseSyncConfig(text: string): SyncConfig {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Nastavení musí být JSON objekt.');
  const config = value as Record<string, unknown>;
  if ((config.version === 3 || config.version === 4) && typeof config.tabFile === 'string' && typeof config.offsetSeconds === 'number' && Number.isFinite(config.offsetSeconds)) {
    const offset = config.version === 3 ? -config.offsetSeconds : config.offsetSeconds;
    if (config.source === 'synth') return { version: 4, source: 'synth', tabFile: config.tabFile, offsetSeconds: offset };
    if (config.source === 'local' && typeof config.mediaFile === 'string' && config.mediaFile.length > 0) {
      return { version: 4, source: 'local', tabFile: config.tabFile, mediaFile: config.mediaFile, offsetSeconds: offset };
    }
    if (config.source === 'youtube' && typeof config.videoId === 'string') {
      return { version: 4, source: 'youtube', tabFile: config.tabFile, videoId: parseVideoId(config.videoId), offsetSeconds: offset };
    }
  }
  // Versions 1 and 2 already used videoTime = tabTime + offset.
  if (config.version === 2 && config.source === 'local' && typeof config.tabFile === 'string' &&
    typeof config.mediaFile === 'string' && config.mediaFile.length > 0 &&
    typeof config.offsetSeconds === 'number' && Number.isFinite(config.offsetSeconds)) {
    return { version: 4, source: 'local', tabFile: config.tabFile, mediaFile: config.mediaFile, offsetSeconds: config.offsetSeconds };
  }
  if (config.version !== 1 || typeof config.tabFile !== 'string' || typeof config.videoId !== 'string' ||
    typeof config.offsetSeconds !== 'number' || !Number.isFinite(config.offsetSeconds)) {
    throw new Error('Nastavení musí obsahovat version: 1, tabFile, videoId a číselný offsetSeconds.');
  }
  return { version: 4, source: 'youtube', tabFile: config.tabFile, videoId: parseVideoId(config.videoId), offsetSeconds: config.offsetSeconds };
}

export function parseOffsetInput(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

