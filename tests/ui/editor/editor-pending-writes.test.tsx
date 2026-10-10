import { useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { MineLibrary, type MineDraft, type MineMaze } from '@/library';
import { createMaze, toggleWall } from '@/maze';
import { writesSettled } from '@/ui/editor/pending-writes';
import { useMazeEditor, type MazeEditor } from '@/ui/editor/use-maze-editor';
import type { OpenMaze } from '@/ui/open-maze';
import { appStorage } from '@/ui/storage';

const PATH = 'classic/pending.txt';

const OPENED: OpenMaze = {
  key: `repo:${PATH}`,
  maze: createMaze({ width: 4, height: 4 }),
  name: 'pending',
  detail: '',
  document: { trailer: '', profile: 'classic', origin: { path: PATH, sha: 'a' } },
};

let editor: MazeEditor | undefined;

function nothing(): void {}

function keep(shown: MazeEditor): void {
  editor = shown;
}

function Harness({ onEditor }: { readonly onEditor: (shown: MazeEditor) => void }) {
  const shown = useMazeEditor({ opened: OPENED, wanted: OPENED.key });
  useEffect(() => onEditor(shown));
  return null;
}

async function removeCopies(): Promise<void> {
  const mine = (await appStorage())?.mine;

  if (mine === undefined) {
    return;
  }

  const made = (await mine.list()).filter((item) => item.origin?.path === PATH);
  await Promise.all(made.map((item) => mine.remove(item.id)));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await writesSettled();
  await removeCopies();
});

describe('The editor and the writes on their way', () => {
  test('writesSettled waits for the copy an edit makes in a slow Mine', async () => {
    let release: () => void = nothing;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const created = vi
      .spyOn(MineLibrary.prototype, 'create')
      .mockImplementation(async function slowCreate(
        this: MineLibrary,
        draft: MineDraft
      ): Promise<MineMaze> {
        calls += 1;
        await held;
        created.mockRestore();
        return this.create(draft);
      });
    await render(<Harness onEditor={keep} />);
    await expect.poll(() => editor?.shown?.key).toBe(OPENED.key);

    editor?.begin();
    editor?.change(toggleWall(OPENED.maze, { direction: 'horizontal', x: 1, y: 1 }));
    editor?.end();
    await expect.poll(() => calls).toBe(1);
    let settled = false;
    const waiting = writesSettled().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(settled).toBe(false);
    release();
    await waiting;
    expect(settled).toBe(true);
  });
});
