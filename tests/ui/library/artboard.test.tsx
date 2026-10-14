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
          height={160}
          slot={160}
          width={160}
          x={0}
          y={0}
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

  test('spans its name and size over the whole slot, even for a tall and narrow maze', async () => {
    const maze = await repoMaze(REPO_MAZES.halfsize);
    await render(
      <div style={{ position: 'relative', width: 400, height: 400, padding: 40 }}>
        <Artboard
          band={thumbnailBand(160)}
          entry={{
            key: 'mine:narrow',
            origin: 'mine',
            name: 'A rather long name for a narrow maze',
            category: 'free',
            width: 4,
            height: 16,
          }}
          height={160}
          maze={maze}
          onFocus={() => undefined}
          slot={160}
          width={40}
          x={60}
          y={60}
        />
      </div>
    );
    const label = document.querySelector('a[data-artboard] > span')?.getBoundingClientRect();
    const thumbnail = document.querySelector('a[data-artboard] canvas')?.getBoundingClientRect();

    expect(label?.width).toBe(160);
    expect((label?.left ?? 0) + 60).toBeCloseTo(thumbnail?.left ?? 0, 3);
  });

  test('keeps the menu of a held finger away, not the one of the mouse, and selects no text', async () => {
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
          height={160}
          maze={maze}
          onFocus={() => undefined}
          slot={160}
          width={160}
          x={0}
          y={40}
        />
      </div>
    );
    const link = document.querySelector('a[data-artboard]');
    const menu = (pointerType: string): boolean => {
      const event = new PointerEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        pointerType,
      });
      link?.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(menu('touch')).toBe(true);
    expect(menu('mouse')).toBe(false);
    expect(link === null ? '' : getComputedStyle(link).userSelect).toBe('none');
  });
});
