/**
 * The e2e project's global setup: builds the app once under `/maze-studio/`, the GitHub Pages
 * base path, into `node_modules/.tmp/` (never `/tmp`), serves it with Vite's preview server, and
 * hands its URL to every e2e file through `inject('appUrl')`.
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { preview } from 'vite';
import type { TestProject } from 'vitest/node';

/** The base path the app is built for. */
export const BASE = '/maze-studio/';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const BUILDS = join(ROOT, 'node_modules', '.tmp');

declare module 'vitest' {
  export interface ProvidedContext {
    /** The URL the built app is served at. */
    appUrl: string;
  }
}

/** Builds and serves the app; the function returned stops the server and removes the build. */
export default async function serveApp(project: TestProject): Promise<() => Promise<void>> {
  mkdirSync(BUILDS, { recursive: true });
  const dist = mkdtempSync(join(BUILDS, 'e2e-'));
  execFileSync('bunx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', BASE_PATH: BASE },
    stdio: 'pipe',
  });
  const server = await preview({
    configFile: false,
    root: ROOT,
    base: BASE,
    logLevel: 'silent',
    build: { outDir: dist },
    preview: { port: 0, host: '127.0.0.1' },
  });
  project.provide('appUrl', new URL(BASE, server.resolvedUrls?.local[0] ?? '').href);

  return async () => {
    await server.close();
    rmSync(dist, { recursive: true, force: true });
  };
}
