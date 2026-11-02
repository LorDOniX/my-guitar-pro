// Original exercise, generated as a real Guitar Pro 7 file for manual smoke tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { exporter, importer } from '@coderline/alphatab';

const score = importer.ScoreLoader.loadAlphaTex(String.raw`
\title "První riff"
\artist "My Guitar Pro"
\tempo 100
.
:8 0.6 0.6 3.6 0.6 5.5 0.6 3.6 0.6 |
0.6 0.6 3.6 0.6 7.5 0.6 5.5 3.5 |
0.6 0.6 3.6 0.6 5.5 0.6 3.6 0.6 |
:4 7.5 5.5 3.5 0.6
`);
const bytes = new exporter.Gp7Exporter().export(score);
mkdirSync(new URL('../public/examples/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/examples/prvni-riff.gp', import.meta.url), bytes);
console.log(`Generated public/examples/prvni-riff.gp (${bytes.length} bytes)`);
