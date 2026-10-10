import { isLibrarySource, type LibraryCategory, type LibrarySource } from '@/library';
import { Hint } from '@/ui/islands/island';

import { folderHint } from './folder-hint';
import { ToggleGroup, ToggleGroupItem } from '@/ui/primitives/toggle-group';
import { cn } from '@/ui/primitives/utils';

const SEGMENT =
  'h-9 flex-none rounded-[10px] px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_0_0_1px_var(--border)] aria-checked:bg-accent aria-checked:text-foreground aria-checked:shadow-[inset_0_0_0_1px_var(--border)] max-[720px]:h-10';

const ALL = 'all';

/** The props of {@link SourceFilter}. */
export interface SourceFilterProps {
  readonly value: LibrarySource;
  readonly mineCount: number;
  /** The opened folder, which adds the Folder source; none while no folder is open. */
  readonly folder?: { readonly name: string; readonly skipped: number };
  readonly onChange: (source: LibrarySource) => void;
}

/**
 * Repo or Mine, with Mine's count in mono, and Folder while a folder is open, named with the files
 * it skipped in its tooltip (DESIGN.md 6.1 and 9.1).
 */
export function SourceFilter({ value, mineCount, folder, onChange }: SourceFilterProps) {
  return (
    <ToggleGroup
      aria-label="Source"
      className="gap-0.5"
      onValueChange={(next) => {
        if (isLibrarySource(next)) {
          onChange(next);
        }
      }}
      type="single"
      value={value}
    >
      <ToggleGroupItem className={SEGMENT} value="repo">
        Repo
      </ToggleGroupItem>
      <ToggleGroupItem className={SEGMENT} value="mine">
        Mine
        {mineCount > 0 ? (
          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {mineCount}
          </span>
        ) : null}
      </ToggleGroupItem>
      {folder === undefined ? null : (
        <Hint label={folderHint(folder)} side="bottom">
          <ToggleGroupItem className={SEGMENT} data-folder="" value="folder">
            Folder
          </ToggleGroupItem>
        </Hint>
      )}
    </ToggleGroup>
  );
}

/** The props of {@link CategoryFilter}. */
export interface CategoryFilterProps {
  readonly value: LibraryCategory;
  readonly onChange: (category: LibraryCategory) => void;
  /** Whether to offer All, which a phone leaves out; clicking the active category clears it. */
  readonly withAll?: boolean;
}

const CATEGORIES: readonly { value: Exclude<LibraryCategory, ''>; label: string; short: string }[] =
  [
    { value: 'classic', label: 'Classic', short: 'Classic' },
    { value: 'halfsize', label: 'Half size', short: 'Half' },
    { value: 'training', label: 'Training', short: 'Training' },
  ];

/** All, Classic, Half size and Training (DESIGN.md 6). */
export function CategoryFilter({ value, onChange, withAll = true }: CategoryFilterProps) {
  return (
    <ToggleGroup
      aria-label="Category"
      className="gap-0.5"
      onValueChange={(next) => {
        const found = CATEGORIES.find((category) => category.value === next);
        onChange(found === undefined ? '' : found.value);
      }}
      type="single"
      value={value === '' ? ALL : value}
    >
      {withAll ? (
        <ToggleGroupItem className={SEGMENT} value={ALL}>
          All
        </ToggleGroupItem>
      ) : null}
      {CATEGORIES.map((category) => (
        <ToggleGroupItem className={cn(SEGMENT)} key={category.value} value={category.value}>
          {withAll ? category.label : category.short}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
