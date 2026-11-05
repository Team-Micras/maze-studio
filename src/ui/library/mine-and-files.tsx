import { useRef, type ReactNode } from 'react';

import { ArrowsClockwise, Export, UploadSimple } from '@/ui/icons';
import { DropdownMenuItem } from '@/ui/primitives/dropdown-menu';

import { pickedFiles } from './picked-file';

/** What the "My mazes and files" menu does (DESIGN.md 6.1). */
export interface MineAndFilesActions {
  readonly onExportAll: () => void;
  readonly onImport: (files: readonly File[]) => void;
  readonly onCheckUpdates: () => void;
}

/** The menu items of {@link MineAndFilesItems}, which a caller may place apart. */
export interface MineAndFilesItemNodes {
  readonly exportAll: ReactNode;
  readonly importFiles: ReactNode;
  readonly checkUpdates: ReactNode;
}

/** The props of {@link MineAndFilesItems}. */
export interface MineAndFilesItemsProps {
  readonly actions: MineAndFilesActions;
  /** Renders the items, given the picker of Import, which stays mounted while the menu closes. */
  readonly children: (items: MineAndFilesItemNodes) => ReactNode;
}

/**
 * The items of "My mazes and files": Export all, Import… and Check for updates. A phone shows
 * them in its `+`; a notebook puts Import… in New maze and the others in its ⋯.
 */
export function MineAndFilesItems({ actions, children }: MineAndFilesItemsProps) {
  const input = useRef<HTMLInputElement>(null);
  const { onExportAll, onImport, onCheckUpdates } = actions;

  return (
    <>
      {children({
        exportAll: (
          <DropdownMenuItem className="rounded-[9px]" onSelect={onExportAll}>
            <Export aria-hidden size={16} />
            Export all
          </DropdownMenuItem>
        ),
        importFiles: (
          <DropdownMenuItem className="rounded-[9px]" onSelect={() => input.current?.click()}>
            <UploadSimple aria-hidden size={16} />
            Import…
          </DropdownMenuItem>
        ),
        checkUpdates: (
          <DropdownMenuItem className="rounded-[9px]" onSelect={onCheckUpdates}>
            <ArrowsClockwise aria-hidden size={16} />
            Check for updates
          </DropdownMenuItem>
        ),
      })}
      <input
        accept=".zip,.txt,application/zip,text/plain"
        aria-hidden
        className="hidden"
        data-import=""
        multiple
        onChange={(event) => pickedFiles(event, onImport)}
        ref={input}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}
