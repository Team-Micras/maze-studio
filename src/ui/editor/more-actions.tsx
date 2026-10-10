import { useRef, useState } from 'react';

import {
  DotsThree,
  DownloadSimple,
  GitDiff,
  Keyboard,
  LinkSimple,
  ShareNetwork,
  Square,
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
  /** Downloads the maze as a `.txt`. */
  readonly onDownload: () => void;
  /** Copies the link, here on a phone, where the island has no link button. */
  readonly onCopyLink?: () => void;
  /** Shares the link with Web Share, where the browser has it. */
  readonly onShare?: () => void;
  /** Renames the maze, only for a maze of Mine. */
  readonly onRename?: () => void;
  /** Deletes the maze from Mine, only for a maze of Mine, on the second select. */
  readonly onDelete?: () => void;
  /** Opens the shortcut help; absent on a touch screen. */
  readonly onHelp?: () => void;
}

const ITEM = 'rounded-[9px]';

/**
 * The editor's ⋯ menu (DESIGN.md 6, 6.1 and 9.2): Download .txt, Copy link and Share… on a phone,
 * Close outer walls, Changes, Rename and Delete for a maze of Mine, and the shortcut help. Delete
 * takes two selects: the first keeps the menu open and turns it into "Confirm delete". A download
 * and Web Share start once the menu has closed.
 */
export function MoreActions({
  editable,
  onCloseBorder,
  onChanges,
  onDownload,
  onCopyLink,
  onShare,
  onRename,
  onDelete,
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
        {onHelp === undefined ? null : (
          <>
            <DropdownMenuSeparator />
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
