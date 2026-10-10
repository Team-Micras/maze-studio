import { FolderOpen, Moon, Plus, Sun } from '@/ui/icons';
import { useRef, type ReactNode } from 'react';

import { MAZEFILES, type LibraryFilter } from '@/library';
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
import { useTheme } from '@/ui/theme';

import { CategoryFilter, SourceFilter } from './filter-toggles';
import { NewMazeDialogs } from './new-maze-menu';
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
  /** The name a new maze gets unless named: "Untitled maze", unique in Mine. */
  readonly newName: string;
  readonly phone: boolean;
  /** The Changes chip, which the notebook's actions island shows first. */
  readonly changes?: ReactNode;
  /** Whether the islands show; they fade out and leave the keyboard while a maze is open. */
  readonly visible: boolean;
}

function Credit({
  library,
  className,
}: {
  readonly library: Library;
  readonly className?: string;
}) {
  return (
    <p
      className={`fixed z-10 h-8 rounded-[10px] bg-card px-3 text-xs leading-8 whitespace-nowrap text-muted-foreground shadow-island ${className ?? ''}`}
    >
      {library.repoCount} mazes from{' '}
      <a
        className="underline underline-offset-[3px] hover:text-foreground"
        href={MAZEFILES.url}
        rel="noreferrer"
        target="_blank"
        translate="no"
      >
        {MAZEFILES.owner}/{MAZEFILES.name}
      </a>{' '}
      at{' '}
      <span className="font-mono tabular-nums" translate="no">
        {library.commit.slice(0, 7)}
      </span>
    </p>
  );
}

interface MenuProps {
  readonly onOpenFile: (file: File) => void;
  readonly onNew: (request: NewMazeRequest) => void;
  readonly newName: string;
}

function NewMazeMenu({ onNew, newName }: Omit<MenuProps, 'onOpenFile'>) {
  return (
    <NewMazeDialogs defaultName={newName} onNew={onNew}>
      {(items) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IslandButton variant="default">
              <Plus aria-hidden size={16} />
              New maze
            </IslandButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-20 min-w-52 rounded-[14px]">
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </NewMazeDialogs>
  );
}

function PhoneMenu({ onOpenFile, onNew, newName }: MenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggle);

  return (
    <NewMazeDialogs defaultName={newName} onNew={onNew}>
      {(items) => (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IslandButton aria-label="New maze and more">
                <Plus aria-hidden size={18} />
              </IslandButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-20 min-w-52 rounded-[14px]">
              {items}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-[9px]" onSelect={() => input.current?.click()}>
                <FolderOpen aria-hidden size={16} />
                Open a .txt file…
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-[9px]" onSelect={toggleTheme}>
                {theme === 'dark' ? <Sun aria-hidden size={16} /> : <Moon aria-hidden size={16} />}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
 * Its props do not, so a moving camera re-renders none of these. A phone stacks the search and the filters at the top and keeps only the
 * credit at the bottom.
 */
export function LibraryChrome({
  library,
  filter,
  onFilter,
  onOpenFile,
  onNew,
  newName,
  phone,
  changes,
  visible,
}: LibraryChromeProps) {
  const change = (next: Partial<LibraryFilter>): void => onFilter({ ...filter, ...next });
  const search = (
    <SearchField enabled={visible} onChange={(query) => change({ query })} value={filter.query} />
  );
  const source = (
    <SourceFilter
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
          <search>
            <Island className="fixed top-safe-2 right-safe-2 left-safe-2">
              {search}
              <PhoneMenu newName={newName} onNew={onNew} onOpenFile={onOpenFile} />
            </Island>
          </search>
          <Island className="fixed top-safe-16 right-safe-2 left-safe-2 overflow-x-auto">
            {source}
            <IslandSeparator />
            {category}
          </Island>
        </header>
      ) : (
        <header>
          <Island
            className="fixed top-4 left-4 h-11 gap-[9px] pr-3 pl-2.5 text-[13px] font-semibold"
            translate="no"
          >
            <i
              aria-hidden
              className="size-[11px] rounded-[2px] bg-[oklch(0.64_0.21_27)] shadow-[0_0_0_2px_oklch(0.17_0_0)]"
            />
            Maze Studio
          </Island>
          <search>
            <Island className="fixed top-4 left-1/2 h-11 -translate-x-1/2">
              {search}
              <IslandSeparator />
              {source}
              <IslandSeparator />
              {category}
            </Island>
          </search>
          <Island className="fixed top-4 right-4 h-11">
            {changes}
            <OpenFileButton onFile={onOpenFile} />
            <NewMazeMenu newName={newName} onNew={onNew} />
            <IslandSeparator />
            <ThemeButton />
          </Island>
        </header>
      )}
      <footer>
        {library === undefined ? null : (
          <Credit
            className={phone ? 'bottom-safe-3 left-1/2 -translate-x-1/2' : 'bottom-[18px] left-4'}
            library={library}
          />
        )}
      </footer>
    </div>
  );
}
