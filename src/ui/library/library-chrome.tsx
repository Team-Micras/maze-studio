import { FolderOpen, FolderSimple, GithubLogo, Moon, Plus, Sun } from '@/ui/icons';
import { useRef, type ReactNode } from 'react';

import { MAZEFILES, type LibraryFilter } from '@/library';
import { useOneRowTopBar } from '@/ui/hooks/use-media-query';
import { Island, IslandButton, IslandSeparator } from '@/ui/islands/island';
import { ThemeButton } from '@/ui/islands/theme-button';
import type { NewMazeRequest } from '@/ui/new-maze';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';
import { cn } from '@/ui/primitives/utils';
import { useTheme } from '@/ui/theme';
import { Verbatim } from '@/ui/verbatim';

import { CategoryFilter, SourceFilter } from './filter-toggles';
import { MineAndFilesItems, type MineAndFilesActions } from './mine-and-files';
import { NewMazeDialogs } from './new-maze-menu';
import { NewMazeMenu } from './new-maze-button';
import { OpenFileButton } from './open-file';
import { pickedFile } from './picked-file';
import { SearchField } from './search-field';
import type { Library } from './use-library';

/** The props of {@link LibraryChrome}. */
export interface LibraryChromeProps {
  /** The library, or `undefined` while it loads. */
  readonly library: Library | undefined;
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpenFile: (file: File) => void;
  /** Opens a new maze in the editor. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** Opens Generate in the editor on a new blank maze, where the board previews the candidates. */
  readonly onGenerate?: () => void;
  /** The name a new maze gets unless named: "Untitled maze", unique in My mazes. */
  readonly newName: string;
  readonly phone: boolean;
  /** What the "My mazes and files" menu does. */
  readonly files: MineAndFilesActions;
  /** What the credit adds of the updates from GitHub, if anything. */
  readonly updateNote?: string | undefined;
  /** The Changes chip, which the notebook's actions island shows first. */
  readonly changes?: ReactNode;
  /** Whether the islands show; they fade out and leave the keyboard while a maze is open. */
  readonly visible: boolean;
}

/** maze-studio's own repository, which the pill beside the credit links. */
const REPOSITORY = 'https://github.com/Team-Micras/maze-studio';

const PILL =
  'h-8 rounded-[10px] bg-card px-3 text-xs leading-8 whitespace-nowrap text-muted-foreground shadow-island';

/**
 * The credit island (DESIGN.md 9.1 and 12): the mazes of the snapshot or the cache in use, at their
 * commit, a pill of its own beside it linking maze-studio's repository, and what the last check
 * for updates found. A phone names mazefiles without its owner, shows only the logo in the
 * repository's pill and stacks the update note above. It gives way to the selection bar, which
 * sits where it does.
 */
function Credit({
  library,
  note,
  phone,
}: {
  readonly library: Library;
  readonly note: string | undefined;
  readonly phone: boolean;
}) {
  return (
    <div
      className={cn(
        'fixed z-10 flex items-center gap-2 [:root:has([data-selection-bar])_&]:hidden',
        phone
          ? 'bottom-safe-3 left-1/2 -translate-x-1/2 flex-col-reverse'
          : 'bottom-safe-[18px] left-safe-4'
      )}
    >
      <div className="flex items-center gap-2">
        <p className={cn(PILL, 'truncate', phone && 'max-w-[calc(100vw-56px)]')}>
          {library.repoCount} mazes from{' '}
          <a
            className="underline underline-offset-[3px] hover:text-foreground"
            href={MAZEFILES.url}
            rel="noreferrer"
            target="_blank"
            translate="no"
          >
            {phone ? MAZEFILES.name : `${MAZEFILES.owner}/${MAZEFILES.name}`}
          </a>{' '}
          at{' '}
          <span className="font-mono tabular-nums" translate="no">
            {library.commit.slice(0, 7)}
          </span>
        </p>
        <a
          aria-label="maze-studio on GitHub"
          className={cn(
            PILL,
            'flex flex-none items-center gap-1.5 hover:text-foreground',
            phone && 'w-8 justify-center px-0'
          )}
          href={REPOSITORY}
          rel="noreferrer"
          target="_blank"
          translate="no"
        >
          <GithubLogo aria-hidden size={14} />
          {phone ? null : 'maze-studio'}
        </a>
      </div>
      <output
        className={cn(PILL, 'truncate empty:hidden', phone && 'max-w-[calc(100vw-16px)]')}
        data-update-note=""
      >
        {note === undefined ? null : <Verbatim text={note} verbatim={library.commit.slice(0, 7)} />}
      </output>
    </div>
  );
}

interface MenuProps {
  readonly onOpenFile: (file: File) => void;
  readonly files: MineAndFilesActions;
  readonly onNew: (request: NewMazeRequest) => void;
  readonly newName: string;
}

/** The "My mazes and files" menu (DESIGN.md 6.1) of the notebook's actions island. */
function MineAndFiles({ files }: { readonly files: MineAndFilesActions }) {
  return (
    <MineAndFilesItems actions={files}>
      {(items) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IslandButton aria-label="My mazes and files">
              <FolderSimple aria-hidden size={18} />
            </IslandButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-20 min-w-52 rounded-[14px]">
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MineAndFilesItems>
  );
}

/** A phone's `+` menu: New maze, Open a .txt file, the "My mazes and files" items and the theme. */
function PhoneMenu({ onOpenFile, files, onNew, newName }: MenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggle);

  return (
    <NewMazeDialogs defaultName={newName} onNew={onNew}>
      {(newItems) => (
        <>
          <MineAndFilesItems actions={files}>
            {(fileItems) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IslandButton aria-label="New maze and more">
                    <Plus aria-hidden size={18} />
                  </IslandButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-20 min-w-52 rounded-[14px]">
                  {newItems}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="rounded-[9px]"
                    onSelect={() => input.current?.click()}
                  >
                    <FolderOpen aria-hidden size={16} />
                    Open a .txt file…
                  </DropdownMenuItem>
                  {fileItems}
                  <DropdownMenuItem className="rounded-[9px]" onSelect={toggleTheme}>
                    {theme === 'dark' ? (
                      <Sun aria-hidden size={16} />
                    ) : (
                      <Moon aria-hidden size={16} />
                    )}
                    {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </MineAndFilesItems>
          <input
            accept=".txt,text/plain"
            aria-hidden
            className="hidden"
            onChange={(event) => pickedFile(event, onOpenFile)}
            ref={input}
            tabIndex={-1}
            type="file"
          />
        </>
      )}
    </NewMazeDialogs>
  );
}

/**
 * The library's islands (DESIGN.md 9.1): the brand, the search, source and category, the actions
 * and the credit; the zoom island is the studio's, since it changes with every move of the camera.
 * Its props do not, so a moving camera re-renders none of these. A phone stacks the search and the
 * filters at the top and keeps only the credit at the bottom. A notebook centres the search and
 * filters between the brand and the actions, or below them where one row would not hold all three.
 */
export function LibraryChrome({
  library,
  filter,
  onFilter,
  onOpenFile,
  onNew,
  onGenerate,
  newName,
  phone,
  changes,
  files,
  updateNote,
  visible,
}: LibraryChromeProps) {
  const oneRow = useOneRowTopBar();
  const change = (next: Partial<LibraryFilter>): void => onFilter({ ...filter, ...next });
  const search = (
    <SearchField enabled={visible} onChange={(query) => change({ query })} value={filter.query} />
  );
  const source = (
    <SourceFilter
      folder={library?.folder}
      mineCount={library?.mineCount ?? 0}
      onChange={(next) => change({ source: next })}
      value={filter.source}
    />
  );
  const category = (
    <CategoryFilter
      onChange={(next) => change({ category: next })}
      value={filter.category}
      withAll={!phone}
    />
  );

  return (
    <div
      className="transition-opacity duration-200 ease-(--ease) data-hidden:pointer-events-none data-hidden:opacity-0"
      data-chrome="library"
      data-hidden={visible ? undefined : ''}
      inert={!visible}
    >
      {phone ? (
        <header>
          {visible ? <h1 className="sr-only">Maze Studio</h1> : null}
          <search>
            <Island className="fixed top-safe-2 right-safe-2 left-safe-2">
              {search}
              <PhoneMenu files={files} newName={newName} onNew={onNew} onOpenFile={onOpenFile} />
            </Island>
          </search>
          <Island className="fixed top-safe-16 right-safe-2 left-safe-2 overflow-x-auto overscroll-x-contain">
            {source}
            <IslandSeparator />
            {category}
          </Island>
        </header>
      ) : (
        <header
          className={cn(
            'pointer-events-none fixed top-safe-4 right-safe-4 left-safe-4 z-10 grid gap-2 *:pointer-events-auto',
            oneRow ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-[1fr_auto]'
          )}
        >
          <Island
            className="h-11 gap-[9px] justify-self-start pr-3 whitespace-nowrap pl-2.5 text-[13px] font-semibold"
            translate="no"
          >
            <i
              aria-hidden
              className="size-[11px] rounded-[2px] bg-[oklch(0.64_0.21_27)] shadow-[0_0_0_2px_oklch(0.17_0_0)]"
            />
            {visible ? <h1>Maze Studio</h1> : 'Maze Studio'}
          </Island>
          <search
            className={cn('min-w-0', !oneRow && 'col-span-full row-start-2 justify-self-center')}
          >
            <Island className="h-11 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]">
              {search}
              <IslandSeparator />
              {source}
              <IslandSeparator />
              {category}
            </Island>
          </search>
          <Island className="h-11 justify-self-end">
            {changes}
            <MineAndFiles files={files} />
            <OpenFileButton onFile={onOpenFile} />
            <NewMazeMenu newName={newName} onGenerate={onGenerate} onNew={onNew} />
            <IslandSeparator />
            <ThemeButton />
          </Island>
        </header>
      )}
      <footer>
        {library === undefined ? null : (
          <Credit library={library} note={updateNote} phone={phone} />
        )}
      </footer>
    </div>
  );
}
