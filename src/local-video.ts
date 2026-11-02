import type { YouTubePlayer } from './youtube';

// Use the same media clock and offset conversion for files and YouTube.
export function createLocalVideoPlayer(video: HTMLVideoElement, onPlayError: () => void): YouTubePlayer {
  return {
    getCurrentTime: () => video.currentTime,
    getDuration: () => Number.isFinite(video.duration) ? video.duration : 0,
    getPlayerState: () => video.paused || video.ended ? 2 : 1,
    getPlaybackRate: () => video.playbackRate,
    getAvailablePlaybackRates: () => [0.5, 0.75, 1, 1.25, 1.5],
    setPlaybackRate: (rate) => { video.playbackRate = rate; },
    getVolume: () => video.volume * 100,
    setVolume: (volume) => { video.volume = Math.max(0, Math.min(1, volume / 100)); },
    seekTo: (seconds) => { video.currentTime = Math.min(seconds, Number.isFinite(video.duration) ? video.duration : seconds); },
    playVideo: () => { void video.play().catch(onPlayError); },
    pauseVideo: () => video.pause(),
    destroy: () => { video.pause(); video.removeAttribute('src'); video.load(); },
  };
}
