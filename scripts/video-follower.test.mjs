import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importer, midi, Settings } from '@coderline/alphatab';
import { parseOffsetInput, parseVideoId, parseSyncConfig, youtubeEmbedUrl } from '../src/youtube.ts';
import { createLocalVideoPlayer } from '../src/local-video.ts';
import { createVideoFollower, videoTargetFromTab } from '../src/video-follower.ts';

function fakeVideo(initialState = 2) {
  const calls = [];
  const data = { time: 0, rate: 1, state: initialState, duration: 300 };
  const video = {
    getCurrentTime: () => data.time, getDuration: () => data.duration,
    getPlaybackRate: () => data.rate, getPlayerState: () => data.state,
    setPlaybackRate: (rate) => { data.rate = rate; },
    seekTo: (seconds) => { calls.push(['seek', seconds]); data.time = seconds; },
    playVideo: () => { calls.push(['play']); data.state = 1; },
    pauseVideo: () => { calls.push(['pause']); data.state = 2; },
  };
  return { video, data, calls };
}
const clock = (milliseconds, offsetSeconds = -2, playing = true, rate = 1) => ({ milliseconds, offsetSeconds, playing, rate });

test('negative offsets accept decimal dot and comma without committing incomplete input', () => {
  assert.equal(parseOffsetInput('-3.5'), -3.5);
  assert.equal(parseOffsetInput(' -3,5 '), -3.5);
  for (const text of ['-', '-.', '', '3.5.2']) assert.equal(parseOffsetInput(text), undefined);
});

test('YouTube URLs accept playlist links and reject foreign hosts', () => {
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=bWXazVhlyxQ&list=RDbWXazVhlyxQ'), 'bWXazVhlyxQ');
  assert.equal(parseVideoId('https://youtu.be/bWXazVhlyxQ?t=12'), 'bWXazVhlyxQ');
  assert.throws(() => parseVideoId('https://youtube.com.evil.example/watch?v=bWXazVhlyxQ'));
});

test('YouTube iframe URL enables API control with the real application origin', () => {
  const url = new URL(youtubeEmbedUrl('bWXazVhlyxQ', 'http://127.0.0.1:5174'));
  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.pathname, '/embed/bWXazVhlyxQ');
  assert.equal(url.searchParams.get('enablejsapi'), '1');
  assert.equal(url.searchParams.get('origin'), 'http://127.0.0.1:5174');
  assert.equal(url.searchParams.get('controls'), '0');
  assert.equal(url.searchParams.get('autoplay'), '0');
});

test('version 4 configuration round trip and validation for all playback sources', () => {
  for (const media of [{ source: 'synth' }, { source: 'youtube', videoId: 'bWXazVhlyxQ' }, { source: 'local', mediaFile: 'video.mp4' }]) {
    const config = { version: 4, tabFile: 'song.gp5', offsetSeconds: -3.5, ...media };
    assert.deepEqual(parseSyncConfig(JSON.stringify(config)), config);
    assert.throws(() => parseSyncConfig(JSON.stringify({ ...config, offsetSeconds: null })));
  }
  assert.throws(() => parseSyncConfig('null'));
});

test('legacy configuration migration preserves alignment', () => {
  const youtube = { version: 1, tabFile: 'song.gp5', videoId: 'bWXazVhlyxQ', offsetSeconds: 3.5 };
  const local = { version: 2, source: 'local', tabFile: 'song.gp5', mediaFile: 'video.mp4', offsetSeconds: -12 };
  assert.deepEqual(parseSyncConfig(JSON.stringify(youtube)), { ...youtube, version: 4, source: 'youtube' });
  assert.deepEqual(parseSyncConfig(JSON.stringify(local)), { ...local, version: 4 });
  assert.deepEqual(parseSyncConfig(JSON.stringify({ ...local, version: 3 })), { ...local, version: 4, offsetSeconds: 12 });
});

test('TAB starts at zero; negative offset waits then starts video from zero', () => {
  const { video, data, calls } = fakeVideo();
  const follower = createVideoFollower(video);
  follower.sync(clock(0), true);
  follower.sync(clock(1000));
  assert.equal(data.time, 0);
  assert.equal(data.state, 2);
  assert.ok(!calls.some(([action]) => action === 'play'));
  follower.sync(clock(2000));
  assert.equal(data.time, 0);
  assert.equal(data.state, 1);
  follower.sync(clock(3500), true);
  assert.equal(data.time, 1.5);
});

test('TAB pause, seek backwards and stop control video without changing TAB position', () => {
  const { video, data } = fakeVideo();
  const follower = createVideoFollower(video);
  const tab = clock(6000);
  follower.sync(tab, true);
  assert.equal(data.time, 4);
  tab.playing = false;
  follower.sync(tab, true);
  assert.equal(data.state, 2);
  tab.milliseconds = 500;
  follower.sync(tab, true);
  assert.equal(data.time, 0);
  assert.equal(tab.milliseconds, 500);
  tab.milliseconds = 0;
  follower.sync(tab, true);
  assert.equal(data.time, 0);
});

test('positive offset starts ahead; speed changes preserve score position', () => {
  const { video, data } = fakeVideo();
  const follower = createVideoFollower(video);
  follower.sync(clock(0, 2), true);
  assert.equal(data.time, 2);
  assert.equal(videoTargetFromTab(clock(2000, -2, true, 1)), 0);
  assert.equal(videoTargetFromTab(clock(4000, -2, true, 0.5)), 0);
  follower.sync(clock(6000, -2, true, 0.5), true);
  assert.equal(data.time, 1);
  assert.equal(data.rate, 0.5);
});

test('a CUED YouTube video is not automatically started by a seek', () => {
  const { video, calls } = fakeVideo(5);
  createVideoFollower(video).sync(clock(0, 3, false), true);
  assert.deepEqual(calls, []);
});

test('drift correction is throttled and an ended video does not stop TAB', () => {
  let now = 0;
  const { video, data, calls } = fakeVideo();
  const follower = createVideoFollower(video, () => now);
  follower.sync(clock(6000));
  assert.equal(data.time, 4);
  data.time = 0;
  now = 500;
  follower.sync(clock(6500));
  assert.equal(calls.filter(([action]) => action === 'seek').length, 1);
  now = 1000;
  follower.sync(clock(7000));
  assert.equal(data.time, 5);
  const tab = clock(400000);
  follower.sync(tab, true);
  assert.equal(data.state, 2);
  assert.equal(tab.playing, true);
  assert.equal(tab.milliseconds, 400000);
});

test('local video handles rejected playback without altering TAB clock', async () => {
  let rejected = false;
  const video = { duration: 300, currentTime: 0, playbackRate: 1, volume: 0.8, paused: true, ended: false,
    play: () => Promise.reject(new Error('autoplay blocked')), pause() { this.paused = true; } };
  const player = createLocalVideoPlayer(video, () => { rejected = true; });
  const tab = clock(4000);
  createVideoFollower(player).sync(tab, true);
  await Promise.resolve();
  assert.equal(rejected, true);
  assert.equal(tab.milliseconds, 4000);
  assert.equal(video.currentTime, 2);
});

test('a library Guitar Pro file retains its independent MIDI time axis', (t) => {
  const root = fileURLToPath(new URL('../items/', import.meta.url));
  const file = existsSync(root) ? readdirSync(root, { recursive: true }).find((name) => /\.(gp[345]?|gpx)$/i.test(name)) : undefined;
  if (!file) { t.skip('No Guitar Pro fixture in items/'); return; }
  const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(join(root, file))));
  const midiFile = new midi.MidiFile();
  new midi.MidiFileGenerator(score, new Settings(), new midi.AlphaSynthMidiFileHandler(midiFile)).generate();
  assert.ok(score.tracks.length > 0);
  assert.ok(score.masterBars.length > 0);
  assert.ok(midiFile.tracks.length > 0);
});
