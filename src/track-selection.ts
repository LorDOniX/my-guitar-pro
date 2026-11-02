import type { model } from '@coderline/alphatab';

export function preferredGuitarTrackIndex(tracks: model.Track[]): number {
  const candidates = tracks.filter((track) => {
    const name = `${track.name} ${track.shortName}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return !track.isPercussion && !/\bbass\b|basov/.test(name);
  });
  const namedGuitar = candidates.find((track) => /guitar|gtr|kytar|gitar/i.test(`${track.name} ${track.shortName}`));
  // General MIDI programs 24–31 cover acoustic, electric and distorted guitars.
  const midiGuitar = candidates.find((track) => track.playbackInfo.program >= 24 && track.playbackInfo.program <= 31);
  return (namedGuitar ?? midiGuitar ?? tracks[0])?.index ?? 0;
}
