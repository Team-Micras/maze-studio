import { useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { mineKey, MineLibrary, type MineDraft, type MineMaze } from '@/library';
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

/** A maze of My mazes that is not in it, so its first save is refused. */
const GONE: OpenMaze = {
  key: mineKey('gone'),
  maze: createMaze({ width: 4, height: 4 }),
  name: 'Gone',
  detail: 'Saved in My mazes',
  document: { trailer: '', profile: 'free', mine: { id: 'gone', version: 1 } },
};

/** A maze the generator made, as Use this opens it, which is copied to My mazes at once. */
const GENERATED: OpenMaze = {
  key: 'new:1',
  maze: toggleWall(createMaze({ width: 4, height: 4 }), { direction: 'horizontal', x: 1, y: 1 }),
  name: 'Generated pending',
  detail: '',
  document: {
    trailer: '',
    profile: 'classic',
    created: true,
    recipe: { version: 7, seed: 3, settings: { size: 4 } },
  },
};

const RENAMED = 'Renamed pending';

let editor: MazeEditor | undefined;

function nothing(): void {}

function keep(shown: MazeEditor): void {
  editor = shown;
}

function Harness({
  opened = OPENED,
  onEditor,
}: {
  readonly opened?: OpenMaze;
  readonly onEditor: (shown: MazeEditor) => void;
}) {
  const shown = useMazeEditor({ opened, wanted: opened.key });
  useEffect(() => onEditor(shown));
  return null;
}

async function removeCopies(): Promise<void> {
  const mine = (await appStorage())?.mine;

  if (mine === undefined) {
    return;
  }

  const made = (await mine.list()).filter(
    (item) => item.origin?.path === PATH || [GENERATED.name, RENAMED].includes(item.name)
  );
  await Promise.all(made.map((item) => mine.remove(item.id)));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await writesSettled();
  await removeCopies();
});

describe('The editor and the writes on their way', () => {
  test('writesSettled waits for the copy an edit makes in a slow My mazes', async () => {
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

  test('a rename while the copy of a generated maze is on its way renames that copy, making no other', async () => {
    let release: () => void = nothing;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const created = vi
      .spyOn(MineLibrary.prototype, 'create')
      .mockImplementation(async function slowCreate(
        this: MineLibrary,
        draft: MineDraft
      ): Promise<MineMaze> {
        await held;
        created.mockRestore();
        return this.create(draft);
      });
    await render(<Harness onEditor={keep} opened={GENERATED} />);
    await expect.poll(() => created.mock.calls.length).toBe(1);

    const renaming = editor?.rename(RENAMED);
    release();
    expect(await renaming).toBe(true);
    await writesSettled();
    const names = ((await (await appStorage())?.mine.list()) ?? [])
      .map((item) => item.name)
      .filter((name) => [GENERATED.name, RENAMED].includes(name));

    expect(names).toEqual([RENAMED]);
    await expect.poll(() => editor?.shown?.name).toBe(RENAMED);
  });

  test('a maze refused by My mazes takes no undo, redo or edit', async () => {
    await render(<Harness onEditor={keep} opened={GONE} />);
    await expect.poll(() => editor?.shown?.key).toBe(GONE.key);
    const edited = toggleWall(GONE.maze, { direction: 'horizontal', x: 1, y: 1 });
    editor?.begin();
    editor?.change(edited);
    editor?.end();
    await expect.poll(() => editor?.readOnly).toBe(true);

    editor?.undo();
    editor?.begin();
    editor?.change(GONE.maze);
    editor?.end();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(editor?.shown?.maze).toBe(edited);
    expect(editor?.canUndo).toBe(true);
  });
});
