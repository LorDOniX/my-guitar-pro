import * as alphaTab from '@coderline/alphatab';
import './style.css';
import { createYouTubeIframe, createYouTubePlayer, loadYouTubeApi, parseOffsetInput, parseSyncConfig, parseVideoId, type SyncConfig, type YouTubePlayer } from './youtube';
import { createLocalVideoPlayer } from './local-video';
import { createVideoFollower } from './video-follower';
import { preferredGuitarTrackIndex } from './track-selection';
import { buildLibrary, type LibraryItem } from './library';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Chybí prvek #${id}`);
  return node as T;
}

const fileInput = element<HTMLInputElement>('file-input');
const play = element<HTMLButtonElement>('play');
const stop = element<HTMLButtonElement>('stop');
const track = element<HTMLSelectElement>('track');
const speed = element<HTMLSelectElement>('speed');
const status = element('status');
const viewport = element('score-viewport');
const empty = element('empty-state');
const overlay = element('drop-overlay');
const audioSource = element<HTMLSelectElement>('audio-source');
const youtubeUrl = element<HTMLInputElement>('youtube-url');
const offsetInput = element<HTMLInputElement>('youtube-offset');
const configOutput = element<HTMLTextAreaElement>('sync-config');
const connectButton = element<HTMLButtonElement>('connect-youtube');
const alignStart = element<HTMLButtonElement>('align-start');
const localVideo = element<HTMLVideoElement>('local-video');
const localInput = element<HTMLInputElement>('local-video-input');
const libraryItems = buildLibrary(import.meta.glob<string>([
  '../items/**/*.{gp,gp3,gp4,gp5,gpx,mp4,m4v,webm,mov,ogv,json}',
  '../items/**/*.{GP,GP3,GP4,GP5,GPX,MP4,M4V,WEBM,MOV,OGV,JSON}',
], { eager: true, query: '?url', import: 'default' }));
let currentLibraryItem: LibraryItem | undefined;
let libraryLoading = false;
let localReady = false;
let localFileName = '';
let localObjectUrl: string | undefined;
const localPlayer = createLocalVideoPlayer(localVideo, () => {
  videoPlaybackBlocked = true;
  videoMessage('Video nelze spustit. Tabulatura pokračuje; zkus přehrávání znovu přes její ovládání nebo vyber jiný formát videa.', true);
});
let api: alphaTab.AlphaTabApi | undefined;
let loading = false;
let hasScore = false;
let currentFile = '';
let youtube: YouTubePlayer | undefined;
let youtubeReady = false;
let connectedVideoId = '';
let offsetSeconds = 0;
let follower = createVideoFollower(localPlayer);
let videoTimer = 0;
let videoLoadId = 0;
let videoPlaybackBlocked = false;

function usesYouTube(): boolean { return audioSource.value === 'youtube'; }
function usesExternalVideo(): boolean { return usesYouTube() || audioSource.value === 'local'; }
function activeVideo(): YouTubePlayer | undefined { return audioSource.value === 'local' ? localPlayer : youtube; }
function videoReady(): boolean { return audioSource.value === 'local' ? localReady : youtubeReady; }

function videoMessage(text: string, error = false): void {
  const output = element('youtube-status');
  output.textContent = text;
  output.classList.toggle('error', error);
}

function exportConfig(): void {
  try {
    const config = audioSource.value === 'synth'
      ? { version: 4, source: 'synth', tabFile: currentFile, offsetSeconds }
      : audioSource.value === 'local'
      ? { version: 4, source: 'local', tabFile: currentFile, mediaFile: localFileName, offsetSeconds }
      : { version: 4, source: 'youtube', tabFile: currentFile, videoId: connectedVideoId || parseVideoId(youtubeUrl.value), offsetSeconds };
    configOutput.value = JSON.stringify(config, null, 2);
  } catch { videoMessage('Pro výstup nastavení zadej platný YouTube odkaz.', true); }
}

function syncVideo(force = false): void {
  const video = activeVideo();
  if (!usesExternalVideo() || !videoReady() || !video || !hasScore || loading) return;
  const rate = api!.playbackSpeed;
  const tabMilliseconds = api!.timePosition;
  const playing = api!.playerState === alphaTab.synth.PlayerState.Playing;
  follower.sync({ milliseconds: tabMilliseconds, rate, offsetSeconds, playing: playing && !videoPlaybackBlocked }, force);
  const waiting = tabMilliseconds * rate / 1000 + offsetSeconds < 0;
  element('sync-clock').textContent = `TAB ${formatTime(tabMilliseconds * rate)} · Video ${formatTime(video.getCurrentTime() * 1000)} · offset ${offsetSeconds.toFixed(3)} s${waiting ? ' · video čeká na svůj začátek' : ''}`;
}

function changeSource(): void {
  youtube?.pauseVideo();
  localVideo.pause();
  clearInterval(videoTimer);
  videoPlaybackBlocked = false;
  element('youtube-frame').hidden = audioSource.value === 'local';
  element('local-video-frame').hidden = audioSource.value !== 'local';
  if (api) {
    api.masterVolume = usesExternalVideo() ? 0 : 1;
  }
  if (usesExternalVideo() && videoReady()) {
    follower = createVideoFollower(activeVideo()!);
    videoTimer = window.setInterval(() => syncVideo(), 50);
    syncVideo(true);
  }
  updateControls();
  if (usesExternalVideo()) videoMessage(videoReady() ? `Tabulatura řídí čas; ${usesYouTube() ? 'YouTube' : 'lokální video'} ji sleduje. Zvuk tabulatury je vypnutý.` : 'Načti video. Tabulatura může běžet samostatně se ztlumeným zvukem.');
  exportConfig();
}

function openLocalVideo(url: string, name: string, objectUrl = false): void {
  localVideo.pause();
  localReady = false;
  localVideo.removeAttribute('src');
  localVideo.load();
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  localObjectUrl = objectUrl ? url : undefined;
  localFileName = name;
  element('local-video-name').textContent = name;
  audioSource.value = 'local';
  changeSource();
  localVideo.src = url;
  localVideo.load();
  videoMessage('Načítám lokální video…');
}

localVideo.addEventListener('loadedmetadata', () => {
  localReady = true;
  if (audioSource.value === 'local') changeSource();
});
localVideo.addEventListener('error', () => {
  localReady = false;
  if (audioSource.value !== 'local') return;
  updateControls();
  videoMessage('Video nelze načíst nebo prohlížeč nepodporuje jeho kodek. Vyber jiný video soubor.', true);
});
localVideo.addEventListener('play', () => {
  if (audioSource.value !== 'local') { localVideo.pause(); return; }
  syncVideo();
});

async function connectVideo(): Promise<void> {
  let videoId: string;
  try { videoId = parseVideoId(youtubeUrl.value); }
  catch { videoMessage('Zadej platný YouTube odkaz nebo ID videa.', true); return; }
  const loadId = ++videoLoadId;
  connectedVideoId = videoId;
  exportConfig();
  youtube?.destroy();
  youtube = undefined;
  youtubeReady = false;
  clearInterval(videoTimer);
  connectButton.disabled = true;
  alignStart.disabled = true;
  audioSource.value = 'youtube';
  changeSource();
  videoMessage('Připojuji YouTube…');
  let readyTimeout = 0;
  try {
    const mount = createYouTubeIframe(videoId, window.location.origin);
    element('youtube-frame').replaceChildren(mount);
    await loadYouTubeApi();
    if (loadId !== videoLoadId) return;
    const fail = (text: string) => {
      if (loadId !== videoLoadId) return;
      clearTimeout(readyTimeout);
      youtubeReady = false;
      connectButton.disabled = false;
      if (!usesYouTube()) return;
      clearInterval(videoTimer);
      updateControls();
      videoMessage(text, true);
    };
    readyTimeout = window.setTimeout(() => fail('Video neodpovídá. Zkus Načíst video znovu nebo přepni na zvuk tabulatury.'), 20000);
    youtube = createYouTubePlayer(mount, {
      events: {
        onReady(event) {
          if (loadId !== videoLoadId) return;
          clearTimeout(readyTimeout);
          youtube = event.target;
          youtubeReady = true;
          connectedVideoId = videoId;
          connectButton.disabled = false;
          alignStart.disabled = false;
          if (usesYouTube()) { changeSource(); exportConfig(); }
        },
        onStateChange(event) {
          if (loadId !== videoLoadId || !youtubeReady) return;
          if (!usesYouTube()) { if (event.data === 1) youtube?.pauseVideo(); return; }
          syncVideo();
        },
        onPlaybackRateChange() {
          if (loadId === videoLoadId && usesYouTube()) syncVideo();
        },
        onError(event) {
          const reasons: Record<number, string> = { 2: 'Neplatný odkaz na video.', 5: 'Prohlížeč nedokáže video přehrát.', 100: 'Video je nedostupné nebo soukromé.', 101: 'YouTube nepovolil vložení videa v tomto přehrávači.', 150: 'YouTube nepovolil vložení videa v tomto přehrávači.', 153: 'YouTube odmítl identitu přehrávače. Otevři aplikaci v běžném prohlížeči přes localhost.' };
          fail(`YouTube: ${reasons[event.data] || `chyba ${event.data}.`} Můžeš přepnout na zvuk tabulatury.`);
        },
        onAutoplayBlocked() { if (usesYouTube()) { videoPlaybackBlocked = true; videoMessage('Prohlížeč zablokoval video. Tabulatura pokračuje; zkus znovu její přehrávání.', true); } },
      },
    });
  } catch (error) {
    if (loadId !== videoLoadId) return;
    clearTimeout(readyTimeout);
    connectButton.disabled = false;
    videoMessage(error instanceof Error ? error.message : 'Video se nepodařilo připojit.', true);
    updateControls();
  }
}

function updateOffset(value: number, normalize = true): void {
  if (!Number.isFinite(value)) { videoMessage('Offset musí být platné číslo v sekundách.', true); return; }
  offsetSeconds = Math.round(value * 1000) / 1000;
  offsetInput.removeAttribute('aria-invalid');
  if (normalize) offsetInput.value = String(offsetSeconds);
  syncVideo(true);
  exportConfig();
}

function message(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function updateControls(): void {
  play.disabled = stop.disabled = !hasScore || loading || !api?.isReadyForPlayback;
  track.disabled = speed.disabled = !hasScore || loading;
  alignStart.disabled = !usesExternalVideo() || !videoReady();
  for (const option of speed.options) option.disabled = usesYouTube() && youtubeReady && !youtube!.getAvailablePlaybackRates().includes(Number(option.value));
  for (const button of element('library-list').querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = loading || libraryLoading;
    button.setAttribute('aria-current', String(button.dataset.itemId === currentLibraryItem?.id));
  }
  for (const id of ['open-file', 'choose-file', 'load-example']) element<HTMLButtonElement>(id).disabled = libraryLoading;
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function getApi(): alphaTab.AlphaTabApi {
  if (api) return api;
  api = new alphaTab.AlphaTabApi(element('score'), {
    core: { fontDirectory: `${import.meta.env.BASE_URL}font/` },
    display: { staveProfile: alphaTab.StaveProfile.Tab },
    player: {
      playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
      enableCursor: true,
      enableUserInteraction: true,
      soundFont: `${import.meta.env.BASE_URL}soundfont/sonivox.sf2`,
      scrollElement: viewport,
    },
  });
  api.scoreLoaded.on((score) => {
    hasScore = true;
    element('song-title').textContent = score.title || currentFile;
    element('song-subtitle').textContent = [score.artist, currentFile].filter(Boolean).join(' · ');
    track.replaceChildren(...score.tracks.map((item) => new Option(item.name || `Stopa ${item.index + 1}`, String(item.index))));
    track.value = String(preferredGuitarTrackIndex(score.tracks));
    const rate = 1;
    speed.value = String(rate);
    api!.playbackSpeed = rate;
    api!.masterVolume = usesExternalVideo() ? 0 : 1;
    exportConfig();
    message('Vykresluji tabulaturu…');
  });
  api.renderFinished.on(() => {
    loading = false;
    message(api!.isReadyForPlayback ? 'Tabulatura je připravena. Můžeš začít hrát.' : 'Tabulatura je připravena. Načítám zvuky pro přehrávání…');
    updateControls();
  });
  api.playerReady.on(() => {
    api!.masterVolume = usesExternalVideo() ? 0 : 1;
    if (hasScore && !loading) message('Tabulatura i přehrávač jsou připraveny.');
    updateControls();
  });
  api.playerStateChanged.on((event) => {
    play.textContent = event.state === alphaTab.synth.PlayerState.Playing ? 'Ⅱ Pozastavit' : '▶ Přehrát';
    syncVideo(true);
  });
  api.playerPositionChanged.on((event) => {
    const rate = api!.playbackSpeed;
    element('time').textContent = `${formatTime(event.currentTime * rate)} / ${formatTime(event.endTime * rate)}`;
    syncVideo(event.isSeek);
  });
  api.error.on((error) => {
    console.error('alphaTab:', error);
    loading = false;
    if (!hasScore) {
      empty.hidden = false;
      viewport.hidden = true;
    }
    updateControls();
    message('Soubor nebo zvuk se nepodařilo načíst. Zkus soubor otevřít znovu a ověř, že jde o platný Guitar Pro soubor.', true);
  });
  return api;
}

async function openFile(file: File, item?: LibraryItem): Promise<boolean> {
  if (loading) return false;
  if (!/\.(gp[345]?|gpx)$/i.test(file.name)) {
    message('Vyber Guitar Pro soubor s příponou .gp, .gpx, .gp5, .gp4 nebo .gp3.', true);
    return false;
  }
  if (file.size === 0) {
    message('Soubor je prázdný. Vyber jiný Guitar Pro soubor.', true);
    return false;
  }
  loading = true;
  hasScore = false;
  api?.stop();
  youtube?.pauseVideo();
  localVideo.pause();
  updateControls();
  message(`Načítám ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    currentFile = item ? `${item.id}/${file.name}` : file.name;
    currentLibraryItem = item;
    empty.hidden = true;
    viewport.hidden = false;
    const player = getApi();
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, player.settings);
    player.renderScore(score, [preferredGuitarTrackIndex(score.tracks)]);
    return true;
  } catch (error) {
    console.error('File import:', error);
    loading = false;
    empty.hidden = false;
    viewport.hidden = true;
    updateControls();
    message('Soubor se nepodařilo otevřít. Zkontroluj, že jde o platný Guitar Pro soubor.', true);
    return false;
  }
}

function libraryMessage(text: string, error = false): void {
  const output = element('library-status');
  output.textContent = text;
  output.classList.toggle('error', error);
}

async function fetchAsset(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function resetLibraryMedia(): void {
  api?.stop();
  clearInterval(videoTimer);
  videoLoadId++;
  youtube?.destroy();
  youtube = undefined;
  youtubeReady = false;
  connectedVideoId = '';
  connectButton.disabled = false;
  localReady = false;
  localPlayer.destroy();
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  localObjectUrl = undefined;
  localFileName = '';
  element('local-video-name').textContent = 'Lokální video zůstává v prohlížeči.';
  element('youtube-frame').replaceChildren();
  element('sync-clock').textContent = 'TAB 0:00 · Video —';
  offsetSeconds = 0;
  offsetInput.value = '0';
  offsetInput.removeAttribute('aria-invalid');
  audioSource.value = 'synth';
  changeSource();
}

async function loadLibraryItem(item: LibraryItem): Promise<void> {
  if (loading || libraryLoading) return;
  libraryLoading = true;
  updateControls();
  element('library-list').setAttribute('aria-busy', 'true');
  libraryMessage(`Načítám ${item.label}…`);
  try {
    const [tabResult, configResult] = await Promise.allSettled([
      fetchAsset(item.tab.url).then((response) => response.blob()),
      item.config ? fetchAsset(item.config.url).then((response) => response.text()).then(parseSyncConfig) : Promise.resolve(undefined),
    ]);
    if (tabResult.status === 'rejected') throw new Error('Tabulaturu se nepodařilo stáhnout.');
    resetLibraryMedia();
    if (!await openFile(new File([tabResult.value], item.tab.name), item)) throw new Error('Tabulaturu se nepodařilo otevřít.');
    if (item.video) openLocalVideo(item.video.url, item.video.name);
    if (configResult.status === 'fulfilled' && configResult.value) applyConfig(configResult.value, true);
    exportConfig();
    const warning = configResult.status === 'rejected';
    libraryMessage(warning
      ? `${item.label}: tabulatura je načtená, ale JSON nastavení je neplatné nebo nedostupné. Používám výchozí nastavení.`
      : `${item.label} · načteno: TAB${item.video ? ' + video' : ''}${item.config ? ' + nastavení' : ''}`, warning);
  } catch (error) {
    libraryMessage(`${item.label}: ${error instanceof Error ? error.message : 'Načtení se nezdařilo.'}`, true);
  } finally {
    libraryLoading = false;
    element('library-list').removeAttribute('aria-busy');
    updateControls();
  }
}

function renderLibrary(): void {
  const count = libraryItems.length;
  element('library-count').textContent = `${count} ${count === 1 ? 'skladba' : count >= 2 && count <= 4 ? 'skladby' : 'skladeb'}`;
  const rows = libraryItems.map((item) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    button.className = 'library-item';
    button.dataset.itemId = item.id;
    const name = document.createElement('span');
    name.className = 'library-name';
    name.textContent = item.artist ? `${item.artist} — ${item.title}` : item.title;
    const badges = document.createElement('span');
    badges.className = 'library-badges';
    for (const label of ['TAB', ...(item.video ? ['VIDEO'] : []), ...(item.config ? ['JSON'] : [])]) {
      const badge = document.createElement('span');
      badge.textContent = label;
      badges.append(badge);
    }
    button.append(name, badges);
    button.addEventListener('click', () => void loadLibraryItem(item));
    row.append(button);
    return row;
  });
  element('library-list').replaceChildren(...rows);
  if (!rows.length) libraryMessage('Žádné skladby. Přidej do items složku „Skupina - Písnička“ obsahující Guitar Pro soubor.');
}

for (const id of ['open-file', 'choose-file']) {
  element(id).addEventListener('click', () => fileInput.click());
}
element('load-example').addEventListener('click', async () => {
  if (loading || libraryLoading) return;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}examples/prvni-riff.gp`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await openFile(new File([await response.blob()], 'prvni-riff.gp'));
  } catch {
    message('Ukázku se nepodařilo načíst. Zkus otevřít vlastní Guitar Pro soubor.', true);
  }
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && !libraryLoading) void openFile(file);
  fileInput.value = '';
});
function togglePlayback(): void {
  videoPlaybackBlocked = false;
  api?.playPause();
}
play.addEventListener('click', togglePlayback);
stop.addEventListener('click', () => {
  api?.stop();
  syncVideo(true);
});
viewport.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [contenteditable]')) return;
  viewport.focus({ preventScroll: true });
});
viewport.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return;
  if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [contenteditable]')) return;
  event.preventDefault();
  if (!event.repeat && !play.disabled) togglePlayback();
});
track.addEventListener('change', () => {
  const selected = api?.score?.tracks[Number(track.value)];
  if (selected) api?.renderTracks([selected]);
});
speed.addEventListener('change', () => {
  if (api) api.playbackSpeed = Number(speed.value);
  syncVideo(true);
});

audioSource.addEventListener('change', changeSource);
connectButton.addEventListener('click', () => void connectVideo());
function commitOffset(): void {
  const value = parseOffsetInput(offsetInput.value);
  if (value === undefined) {
    offsetInput.setAttribute('aria-invalid', 'true');
    videoMessage('Zadej offset v sekundách, například -3.5 nebo -3,5.', true);
    return;
  }
  updateOffset(value);
}
offsetInput.addEventListener('change', commitOffset);
offsetInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); commitOffset(); }
});
offsetInput.addEventListener('input', () => {
  // Preserve intermediate input such as "-" and "-3." while typing.
  const value = parseOffsetInput(offsetInput.value);
  if (value !== undefined) updateOffset(value, false);
});
element('offset-minus').addEventListener('click', () => updateOffset(offsetSeconds - 0.1));
element('offset-plus').addEventListener('click', () => updateOffset(offsetSeconds + 0.1));
alignStart.addEventListener('click', () => {
  if (videoReady() && api) updateOffset(activeVideo()!.getCurrentTime() - api.timePosition * api.playbackSpeed / 1000);
});
element('open-local-video').addEventListener('click', () => localInput.click());
localInput.addEventListener('change', () => {
  const file = localInput.files?.[0];
  localInput.value = '';
  if (!file) return;
  if (!file.size || (!file.type.startsWith('video/') && !/\.(mp4|m4v|webm|mov|ogv)$/i.test(file.name))) {
    videoMessage('Vyber neprázdný video soubor, například MP4.', true);
    return;
  }
  openLocalVideo(URL.createObjectURL(file), file.name, true);
});
element('export-sync').addEventListener('click', exportConfig);
function applyConfig(config: SyncConfig, fromLibrary = false): void {
  if (!fromLibrary && config.tabFile && currentFile && config.tabFile !== currentFile) throw new Error(`Nastavení patří k souboru „${config.tabFile}“. Nejdřív otevři tento soubor.`);
  if (config.source === 'synth') {
    updateOffset(config.offsetSeconds);
    audioSource.value = 'synth';
    changeSource();
    return;
  }
  if (config.source === 'local') {
    updateOffset(config.offsetSeconds);
    const videoAsset = currentLibraryItem?.video;
    if (videoAsset && (fromLibrary || config.mediaFile === videoAsset.name)) {
      if (localFileName === videoAsset.name && localVideo.getAttribute('src') === videoAsset.url) {
        audioSource.value = 'local';
        changeSource();
      } else openLocalVideo(videoAsset.url, videoAsset.name);
    } else if (config.mediaFile === localFileName && localReady) {
      audioSource.value = 'local';
      changeSource();
    } else if (fromLibrary) {
      audioSource.value = 'synth';
      changeSource();
      videoMessage('Nastavení offsetu je načtené; ke skladbě chybí lokální video. Používám zvuk tabulatury.');
    } else {
      localReady = false;
      localPlayer.destroy();
      localFileName = config.mediaFile;
      audioSource.value = 'local';
      changeSource();
      videoMessage(`Offset obnoven. Vyber video „${config.mediaFile}“ tlačítkem Načíst video ze souboru.`);
    }
    return;
  }
  youtubeUrl.value = `https://www.youtube.com/watch?v=${config.videoId}`;
  updateOffset(config.offsetSeconds);
  void connectVideo();
}
element('import-sync').addEventListener('click', () => {
  try {
    applyConfig(parseSyncConfig(configOutput.value));
  } catch (error) { videoMessage(error instanceof Error ? error.message : 'Neplatné nastavení.', true); }
});
renderLibrary();
exportConfig();

let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth++;
  overlay.hidden = false;
});
document.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = loading || libraryLoading ? 'none' : 'copy';
});
document.addEventListener('dragleave', (event) => {
  event.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; overlay.hidden = true; }
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  const files = event.dataTransfer?.files;
  if (libraryLoading) return;
  if (!files?.length) return;
  if (files.length > 1) { message('Otevři prosím vždy jen jeden Guitar Pro soubor.', true); return; }
  void openFile(files[0]);
});

function dispose(): void {
  clearInterval(videoTimer);
  videoLoadId++;
  youtube?.destroy();
  localPlayer.destroy();
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  api?.destroy();
}
window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); });
if (import.meta.hot) import.meta.hot.dispose(dispose);
