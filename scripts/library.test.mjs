import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary } from '../src/library.ts';

test('library requires a tab and associates optional media and config only within its song folder', () => {
  const items = buildLibrary({
    '../items/Z Band - Song/tab.gp': '/tab-z.gp',
    '../items/Z Band - Song/video.mp4': '/video-z.mp4',
    '../items/Z Band - Song/config.json': '/config-z.json',
    '../items/A Band - Tab only/song.GP5': '/tab-a.gp5',
    '../items/No tab - Video only/video.mp4': '/orphan.mp4',
    '../items/No tab - Config only/config.json': '/orphan.json',
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'A Band - Tab only');
  assert.equal(items[0].video, undefined);
  assert.equal(items[0].config, undefined);
  assert.equal(items[1].artist, 'Z Band');
  assert.equal(items[1].title, 'Song');
  assert.equal(items[1].video.url, '/video-z.mp4');
  assert.equal(items[1].config.url, '/config-z.json');
});

test('conventional filenames win deterministically; remaining dashes belong to the song title', () => {
  const [item] = buildLibrary({
    '../items/Band - Song - Live/a.gp5': '/alternate.gp5',
    '../items/Band - Song - Live/tab.gp': '/preferred.gp',
    '../items/Band - Song - Live/a.mp4': '/alternate.mp4',
    '../items/Band - Song - Live/video.webm': '/preferred.webm',
    '../items/Band - Song - Live/settings.json': '/alternate.json',
    '../items/Band - Song - Live/config.json': '/preferred.json',
  });
  assert.equal(item.title, 'Song - Live');
  assert.equal(item.tab.url, '/preferred.gp');
  assert.equal(item.video.url, '/preferred.webm');
  assert.equal(item.config.url, '/preferred.json');
});

test('empty library and folders with identical basenames never mix their assets', () => {
  assert.deepEqual(buildLibrary({}), []);
  const items = buildLibrary({
    '../items/Band A - Song/tab.gp': '/a.gp',
    '../items/Band B - Song/tab.gp': '/b.gp',
    '../items/Band B - Song/config.json': '/b.json',
  });
  assert.equal(items[0].config, undefined);
  assert.equal(items[1].config.url, '/b.json');
});
