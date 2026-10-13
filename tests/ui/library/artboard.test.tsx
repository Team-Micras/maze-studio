import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { thumbnailBand } from '@/render';
import '@/ui/styles.css';
import { Artboard } from '@/ui/library/artboard';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

describe('Artboard', () => {
  test('holds a floor-colored square of the final size while its thumbnail is not drawn, and no spinner', async () => {
    const maze = await repoMaze(REPO_MAZES.halfsize);
    await render(
      <div style={{ position: 'relative', width: 400, height: 400 }}>
        <Artboard
          band={thumbnailBand(160)}
          entry={{
            key: 'repo:halfsize/x.txt',
            origin: 'repo',
            name: 'x',
            category: 'halfsize',
            width: maze.width,
            height: maze.height,
            path: 'halfsize/x.txt',
          }}
          maze={maze}
          onFocus={() => undefined}
          rect={{ x: 0, y: 0, width: 160, height: 160 }}
        />
      </div>
    );
    const canvas = document.querySelector<HTMLCanvasElement>('a[data-artboard] canvas');
    const link = document.querySelector('a[data-artboard]');

    expect(canvas?.getBoundingClientRect().width).toBe(160);
    expect(canvas?.getBoundingClientRect().height).toBe(160);
    expect(canvas === null ? '' : getComputedStyle(canvas).backgroundColor).toBe('oklch(0.17 0 0)');
    expect(link?.querySelectorAll('svg, [role="progressbar"], [aria-busy]')).toHaveLength(0);
  });
});
