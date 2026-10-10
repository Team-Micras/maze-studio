import { useRef, type ReactNode } from 'react';

import { ArrowsClockwise, Export, FolderSimple, UploadSimple } from '@/ui/icons';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/primitives/dropdown-menu';

import { pickedFiles } from './picked-file';

/** What the "Mine and files" menu does (DESIGN.md 6.1). */
export interface MineAndFilesActions {
  readonly onExportAll: () => void;
  readonly onImport: (files: readonly File[]) => void;
  readonly onCheckUpdates: () => void;
  /** Opens a local folder as the Folder source; absent where the browser cannot. */
  readonly onOpenFolder?: () => void;
}

/** The props of {@link MineAndFilesItems}. */
export interface MineAndFilesItemsProps {
  readonly actions: MineAndFilesActions;
  /** Renders the items, given the picker of Import, which stays mounted while the menu closes. */
  readonly children: (items: ReactNode) => ReactNode;
}

/**
 * The items of the "Mine and files" menu: Export all, Import…, Open folder… where the browser can
 * open one, and Check for updates. The notebook shows them in their own menu, a phone in its `+`.
 */
export function MineAndFilesItems({ actions, children }: MineAndFilesItemsProps) {
  const input = useRef<HTMLInputElement>(null);
  const { onExportAll, onImport, onCheckUpdates, onOpenFolder } = actions;

  return (
    <>
      {children(
        <>
          <DropdownMenuItem className="rounded-[9px]" onSelect={onExportAll}>
            <Export aria-hidden size={16} />
            Export all
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-[9px]" onSelect={() => input.current?.click()}>
            <UploadSimple aria-hidden size={16} />
            Import…
          </DropdownMenuItem>
          {onOpenFolder === undefined ? null : (
            <DropdownMenuItem className="rounded-[9px]" onSelect={onOpenFolder}>
              <FolderSimple aria-hidden size={16} />
              Open folder…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-[9px]" onSelect={onCheckUpdates}>
            <ArrowsClockwise aria-hidden size={16} />
            Check for updates
          </DropdownMenuItem>
        </>
      )}
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
