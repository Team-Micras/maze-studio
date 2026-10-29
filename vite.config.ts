import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

import { deflateZeros } from './tests/support/library/browser-deflate.ts';

const PERFORMANCE_TESTS = ['tests/**/*-performance.test.{ts,tsx}'];

/**
 * Reference screenshots live next to their test in `screenshots/`, committed, unlike the
 * screenshots of failures, which stay in the ignored `__screenshots__`. They are made in the
 * Playwright image of the pinned version (AGENTS.md), and a picture may differ from its reference
 * in 0.2 % of its pixels, the antialiasing that differs between machines.
 */
const SCREENSHOT_REFERENCES = 'screenshots';

const SCREENSHOT_MISMATCH = 0.002;

/**
 * The viewport of the browser tests, and of the page that holds their iframe. Without the UI,
 * Vitest shrinks the iframe to fit that page with a CSS scale; at Playwright's default 1280 × 720
 * that is 0.8, which Chromium rasterises late and not always the same, so the page is as large as
 * the iframe and the scale stays 1.
 */
const BROWSER_VIEWPORT = { width: 1440, height: 900 } as const;

function chromium() {
  return {
    enabled: true,
    headless: true,
    provider: playwright({ contextOptions: { viewport: BROWSER_VIEWPORT } }),
    viewport: BROWSER_VIEWPORT,
    instances: [{ browser: 'chromium' as const }],
    commands: { deflateZeros },
    expect: {
      toMatchScreenshot: {
        comparatorName: 'pixelmatch' as const,
        comparatorOptions: { allowedMismatchedPixelRatio: SCREENSHOT_MISMATCH },
        resolveScreenshotPath: ({
          arg,
          browserName,
          ext,
          platform,
          root,
          testFileDirectory,
          testFileName,
        }: {
          arg: string;
          browserName: string;
          ext: string;
          platform: string;
          root: string;
          testFileDirectory: string;
          testFileName: string;
        }) =>
          `${root}/${testFileDirectory}/${SCREENSHOT_REFERENCES}/${testFileName}/${arg}-${browserName}-${platform}${ext}`,
      },
    },
  };
}

/**
 * How many test files run at once, so a full check stays near half the cores of the reference
 * notebook and well under 4 GB: each browser file is a Chromium page of 150–250 MB. The groups run
 * one after the other, unit tests first, and the performance tests alone, one file at a time.
 */
const WORKERS = { unit: 6, browser: 4, performance: 1, e2e: 1 } as const;

/** The dark desk colour (`src/ui/theme.ts`), for the title bar and splash of the installed app. */
const DARK_COLOR = '#191919';

/**
 * The largest chunk shipped, the entry with React DOM, is about 200 kB before gzip; a warning past
 * this means one grew.
 */
export const CHUNK_SIZE_WARNING_KB = 400;

/**
 * Radix and the small packages its popovers and menus stand on, kept in a chunk of their own beside
 * React's, so the app's own chunk shows how much the app itself weighs.
 */
const RADIX_MODULES =
  /node_modules[\\/](@radix-ui|radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden|get-nonce|detect-node-es|tslib)[\\/]/;

/** The app sits at the root; the e2e build sets `BASE_PATH` to check it also works under a path. */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['maze-studio.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'maze-studio',
        short_name: 'maze-studio',
        description: 'Browse, view and edit micromouse mazes in the mazefiles format',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        theme_color: DARK_COLOR,
        background_color: DARK_COLOR,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'maze-studio.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      strategies: 'injectManifest',
      srcDir: 'sw',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: [
          '**/*.{js,css,html,svg,png,webmanifest}',
          'assets/geist-latin-wght-normal-*.woff2',
          'assets/geist-latin-ext-wght-normal-*.woff2',
          'assets/geist-mono-latin-wght-normal-*.woff2',
          'assets/geist-mono-latin-ext-wght-normal-*.woff2',
        ],
        globIgnores: ['sw.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: CHUNK_SIZE_WARNING_KB,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'radix', test: RADIX_MODULES },
          ],
        },
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          maxWorkers: WORKERS.unit,
          sequence: { groupOrder: 0 },
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'tests/e2e/**', ...PERFORMANCE_TESTS],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          globalSetup: ['tests/support/e2e/serve-app.ts'],
          maxWorkers: WORKERS.e2e,
          sequence: { groupOrder: 3 },
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 90_000,
          hookTimeout: 180_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          maxWorkers: WORKERS.browser,
          sequence: { groupOrder: 1 },
          include: ['tests/**/*.test.tsx'],
          exclude: [...configDefaults.exclude, ...PERFORMANCE_TESTS],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          expect: { poll: { timeout: 10_000 } },
          browser: chromium(),
        },
      },
      {
        extends: true,
        test: {
          name: 'performance',
          include: PERFORMANCE_TESTS,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          expect: { poll: { timeout: 10_000 } },
          maxWorkers: WORKERS.performance,
          sequence: { groupOrder: 2 },
          browser: chromium(),
        },
      },
    ],
  },
});
