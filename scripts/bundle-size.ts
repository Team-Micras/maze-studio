/**
 * The gzip size of the built app, reported against a target of 250 KB for what the first screen
 * loads: the entry script, its stylesheet and every chunk `dist/index.html` preloads, then the
 * chunk the entry imports for the app, or for the embed, with the chunks those import in turn.
 * Fonts are not counted in it; the total of every script and stylesheet is printed for reference.
 *
 * It also reports the largest chunk before gzip against the chunk size Vite warns past
 * (`CHUNK_SIZE_WARNING_KB`, in kB of 1000 bytes, as Vite counts them).
 *
 * Run with `bun run size` after `bun run build`. It only reports, over the budget or not; it fails
 * only when the build lacks the app's or the embed's chunk, which it would otherwise leave uncounted.
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

/** The chunks a built chunk imports statically, as paths under `dist/`. */
function staticImports(file: string): string[] {
  const code = readFileSync(join(DIST, file), 'utf8');
  return references(code, /(?:from|import)\s*"\.\/([^"]+\.js)"/g).map((name) => `assets/${name}`);
}

/** `files` and every chunk they import statically, through any depth. */
function closure(files: Iterable<string>): Set<string> {
  const found = new Set<string>();
  const queue = [...files];

  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (!found.has(file)) {
      found.add(file);
      queue.push(...staticImports(file));
    }
  }

  return found;
}

/**
 * The chunk built from the module named `name`, such as `app` for `src/ui/app.tsx`: its name and
 * the 8 characters of its hash, so `app-shell-<hash>.js` is not taken for it.
 */
function chunkOf(name: string): string | undefined {
  return assets.find((file) => new RegExp(`^assets/${name}-[\\w-]{8}\\.js$`).test(file));
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

/** What the first screen of each entry of `src/main.tsx` loads: the eager files and its chunks. */
const screens = ['app', 'embed'].map((name) => {
  const chunk = chunkOf(name);

  if (chunk === undefined) {
    throw new Error(
      `dist/assets has no ${name} chunk to count; was its module renamed or inlined?`
    );
  }

  const files = new Set([...eager, ...closure([chunk])]);
  return { name, files, bytes: sum(files) };
});

console.log(`index            ${kb(sum(entry))}`);
console.log(`eager            ${kb(eagerBytes)}  (${eager.size} files)`);

for (const screen of screens) {
  console.log(`${screen.name.padEnd(17)}${kb(screen.bytes)}  (${screen.files.size} files)`);
}

console.log(`total            ${kb(sum(everything))}  (${everything.length} files)`);

const [app] = screens;

if (app !== undefined) {
  console.log(`counted          ${kb(app.bytes)} of the ${TARGET_KB} KB target (app)`);
}

const [largest] = everything
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, kB: statSync(join(DIST, file)).size / 1000 }))
  .toSorted((left, right) => right.kB - left.kB);

if (largest !== undefined) {
  console.log(
    `largest chunk    ${largest.kB.toFixed(1)} kB before gzip of the ${CHUNK_SIZE_WARNING_KB} kB warning limit (${largest.file})`
  );
}
