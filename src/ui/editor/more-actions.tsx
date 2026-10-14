import { useRef, useState } from 'react';

import {
  CornersOut,
  DotsThree,
  DownloadSimple,
  FloppyDisk,
  GitDiff,
  Keyboard,
  LinkSimple,
  Moon,
  ShareNetwork,
  Square,
  Sun,
  Textbox,
  Trash,
} from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';
import { cn } from '@/ui/primitives/utils';

/** The props of {@link MoreActions}. */
export interface MoreActionsProps {
  /** Whether the maze can change; not while another tab holds a newer version. */
  readonly editable: boolean;
  readonly onCloseBorder: () => void;
  /** Opens the Changes panel, also with nothing in it. */
  readonly onChanges: () => void;
  /** Copies a link or a file to My mazes as it is; absent once it is there, or while editing on a phone. */
  readonly onSaveToMine?: () => void;
  /** Downloads the maze as a `.txt`. */
  readonly onDownload: () => void;
  /** Copies the link, here on a phone, where the island has no link button. */
  readonly onCopyLink?: () => void;
  /** Shares the link with Web Share, where the browser has it. */
  readonly onShare?: () => void;
  /** Renames the maze, only for a maze of My mazes. */
  readonly onRename?: () => void;
  /** Deletes the maze from My mazes, only for a maze of My mazes, on the second select. */
  readonly onDelete?: () => void;
  /** Fits the board, as `0` does. */
  readonly onFit: () => void;
  /** The theme now, which the theme item turns over. */
  readonly theme: 'light' | 'dark';
  readonly onToggleTheme: () => void;
  /** Opens the shortcut help; absent on a touch screen. */
  readonly onHelp?: () => void;
}

const ITEM = 'rounded-[9px]';

/**
 * The editor's ⋯ menu (DESIGN.md 6, 6.1 and 9.2): Save to My mazes for a link or a `.txt`, Download .txt, Copy link and Share… on a phone,
 * Close outer walls, Changes, Rename and Delete for a maze of My mazes, Fit, the theme and the
 * shortcut help. Delete
 * takes two selects: the first keeps the menu open and turns it into "Confirm delete". A download
 * and Web Share start once the menu has closed.
 */
export function MoreActions({
  editable,
  onCloseBorder,
  onChanges,
  onSaveToMine,
  onDownload,
  onCopyLink,
  onShare,
  onRename,
  onDelete,
  onFit,
  theme,
  onToggleTheme,
  onHelp,
}: MoreActionsProps) {
  const [armed, setArmed] = useState(false);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const later = (action: () => void) => () => {
    afterClose.current = action;
  };

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          setArmed(false);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <IslandButton aria-label="More actions">
          <DotsThree aria-hidden size={18} />
        </IslandButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-20 min-w-56 rounded-[14px]"
        onCloseAutoFocus={() => {
          const action = afterClose.current;
          afterClose.current = undefined;
          action?.();
        }}
      >
        {onSaveToMine === undefined ? null : (
          <DropdownMenuItem className={ITEM} onSelect={onSaveToMine}>
            <FloppyDisk aria-hidden size={16} />
            Save to My mazes
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={ITEM} onSelect={later(onDownload)}>
          <DownloadSimple aria-hidden size={16} />
          Download .txt
        </DropdownMenuItem>
        {onCopyLink === undefined ? null : (
          <DropdownMenuItem className={ITEM} onSelect={onCopyLink}>
            <LinkSimple aria-hidden size={16} />
            Copy link
          </DropdownMenuItem>
        )}
        {onShare === undefined ? null : (
          <DropdownMenuItem className={ITEM} onSelect={later(onShare)}>
            <ShareNetwork aria-hidden size={16} />
            Share…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} disabled={!editable} onSelect={onCloseBorder}>
          <Square aria-hidden size={16} />
          Close outer walls
          <DropdownMenuShortcut>B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={onChanges}>
          <GitDiff aria-hidden size={16} />
          Changes
        </DropdownMenuItem>
        {onRename === undefined ? null : (
          <DropdownMenuItem className={ITEM} disabled={!editable} onSelect={onRename}>
            <Textbox aria-hidden size={16} />
            Rename…
          </DropdownMenuItem>
        )}
        {onDelete === undefined ? null : (
          <DropdownMenuItem
            className={cn(ITEM, armed && 'text-destructive focus:text-destructive')}
            disabled={!editable}
            onSelect={(event) => {
              if (armed) {
                onDelete();
              } else {
                event.preventDefault();
                setArmed(true);
              }
            }}
          >
            <Trash aria-hidden size={16} />
            {armed ? 'Confirm delete' : 'Delete'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} onSelect={onFit}>
          <CornersOut aria-hidden size={16} />
          Fit
          <DropdownMenuShortcut>0</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={onToggleTheme}>
          {theme === 'dark' ? <Sun aria-hidden size={16} /> : <Moon aria-hidden size={16} />}
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        {onHelp === undefined ? null : (
          <>
            <DropdownMenuItem className={ITEM} onSelect={onHelp}>
              <Keyboard aria-hidden size={16} />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
