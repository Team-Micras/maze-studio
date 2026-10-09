/**
 * The gzip size of the built app, reported against a target of 250 KB for what the first screen
 * loads: the entry script, its stylesheet and every chunk `dist/index.html` preloads. Fonts are
 * not counted in it; the total of every script and stylesheet is printed for reference.
 *
 * It also reports the largest chunk before gzip against the chunk size Vite warns past
 * (`CHUNK_SIZE_WARNING_KB`, in kB of 1000 bytes, as Vite counts them).
 *
 * Run with `bun run size` after `bun run build`. It only reports; it never fails the check.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { CHUNK_SIZE_WARNING_KB } from '../vite.config';

const TARGET_KB = 250;
const DIST = join(import.meta.dirname, '..', 'dist');
const KB = 1024;

function gzipBytes(file: string): number {
  return gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
}

function references(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter((path) => path !== undefined);
}

function sum(files: Iterable<string>): number {
  let total = 0;

  for (const file of files) {
    total += gzipBytes(file);
  }

  return total;
}

function kb(bytes: number): string {
  return `${(bytes / KB).toFixed(1)} KB`;
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entry = references(html, /<script[^>]*\ssrc="\/([^"]+)"/g);
const preloaded = references(html, /<link rel="modulepreload"[^>]*\shref="\/([^"]+)"/g);
const stylesheets = references(html, /<link rel="stylesheet"[^>]*\shref="\/([^"]+)"/g);
const assets = readdirSync(join(DIST, 'assets')).map((name) => `assets/${name}`);

const eager = new Set([...entry, ...preloaded, ...stylesheets]);
const everything = assets.filter((file) => file.endsWith('.js') || file.endsWith('.css'));

const eagerBytes = sum(eager);

console.log(`index            ${kb(sum(entry))}`);
console.log(`eager            ${kb(eagerBytes)}  (${eager.size} files)`);
console.log(`total            ${kb(sum(everything))}  (${everything.length} files)`);
console.log(`counted          ${kb(eagerBytes)} of the ${TARGET_KB} KB target (eager)`);

const [largest] = everything
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, kB: statSync(join(DIST, file)).size / 1000 }))
  .toSorted((left, right) => right.kB - left.kB);

if (largest !== undefined) {
  console.log(
    `largest chunk    ${largest.kB.toFixed(1)} kB before gzip of the ${CHUNK_SIZE_WARNING_KB} kB warning limit (${largest.file})`
  );
}
