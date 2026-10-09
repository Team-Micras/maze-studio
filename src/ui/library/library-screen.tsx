import { FolderOpen, Moon, Plus, Sun } from '@phosphor-icons/react';
import { useRef } from 'react';

import { MAZEFILES, type LibraryFilter } from '@/library';
import { usePhoneLayout } from '@/ui/hooks/use-media-query';
import { Island, IslandButton, IslandSeparator } from '@/ui/islands/island';
import { ThemeButton } from '@/ui/islands/theme-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';
import { useTheme } from '@/ui/theme';

import { CategoryFilter, SourceFilter } from './filter-toggles';
import { OpenFileButton } from './open-file';
import { LibraryStage } from './library-stage';
import { pickedFile } from './picked-file';
import { SearchField } from './search-field';
import type { Library } from './use-library';

/** The props of {@link LibraryScreen}. */
export interface LibraryScreenProps {
  /** The library, or `undefined` while it loads. */
  readonly library: Library | undefined;
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpenFile: (file: File) => void;
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

function PhoneMenu({ onOpenFile }: { readonly onOpenFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggle);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IslandButton aria-label="More">
            <Plus aria-hidden size={18} />
          </IslandButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-20 min-w-48 rounded-[14px]">
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
  );
}

/**
 * The library (PLAN.md 3.4, DESIGN.md 9.1): every maze on a canvas, the search, source and
 * category in one island, the actions in another, the credit and the zoom at the bottom. A phone
 * stacks the search and the filters at the top and keeps only the credit at the bottom.
 */
export function LibraryScreen({ library, filter, onFilter, onOpenFile }: LibraryScreenProps) {
  const phone = usePhoneLayout();
  const change = (next: Partial<LibraryFilter>): void => onFilter({ ...filter, ...next });
  const search = <SearchField onChange={(query) => change({ query })} value={filter.query} />;
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
    <>
      <main>
        {library === undefined ? null : (
          <LibraryStage filter={filter} library={library} phone={phone} />
        )}
      </main>
      {phone ? (
        <header>
          <search>
            <Island className="fixed top-2 right-2 left-2">
              {search}
              <PhoneMenu onOpenFile={onOpenFile} />
            </Island>
          </search>
          <Island className="fixed top-[64px] right-2 left-2 overflow-x-auto">
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
            <OpenFileButton onFile={onOpenFile} />
            <IslandSeparator />
            <ThemeButton />
          </Island>
        </header>
      )}
      <footer>
        {library === undefined ? null : (
          <Credit
            className={phone ? 'bottom-3 left-1/2 -translate-x-1/2' : 'bottom-[18px] left-4'}
            library={library}
          />
        )}
      </footer>
    </>
  );
}
