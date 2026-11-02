import type { YouTubePlayer } from './youtube';

export interface TabClock {
  milliseconds: number;
  rate: number;
  playing: boolean;
  offsetSeconds: number;
}

// alphaTab's reported milliseconds are scaled by playbackSpeed.
export function videoTargetFromTab(clock: TabClock): number {
  return clock.milliseconds * clock.rate / 1000 + clock.offsetSeconds;
}

export function createVideoFollower(video: YouTubePlayer, now = () => performance.now()) {
  let lastSeek = -Infinity;
  let lastPlay = -Infinity;
  return {
    sync(clock: TabClock, force = false): void {
      const target = videoTargetFromTab(clock);
      const state = video.getPlayerState();
      const duration = video.getDuration();
      const waiting = target < 0;
      const finished = duration > 0 && target >= duration;
      const shouldPlay = clock.playing && !waiting && !finished;
      if (video.getPlaybackRate() !== clock.rate) video.setPlaybackRate(clock.rate);
      const position = Math.max(0, Math.min(target, duration > 0 ? duration : Infinity));
      const difference = Math.abs(video.getCurrentTime() - position);
      // YouTube seeks can start CUED videos. Defer those until TAB starts.
      const canSeek = shouldPlay || state === 1 || state === 2 || state === 3;
      if (canSeek && (force || (difference > 0.35 && now() - lastSeek >= 1000))) {
        video.seekTo(position, true);
        lastSeek = now();
      }
      if (shouldPlay) {
        if (state !== 1 && state !== 3 && (force || now() - lastPlay >= 1000)) {
          video.playVideo();
          lastPlay = now();
        }
      } else if (state === 1 || state === 3) video.pauseVideo();
    },
  };
}
