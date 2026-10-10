import { DotsThree, Keyboard, Square, GitDiff } from '@/ui/icons';

import { Hint, IslandButton } from '@/ui/islands/island';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';

/** The props of {@link MoreActions}. */
export interface MoreActionsProps {
  /** Whether the maze can change; not while another tab holds a newer version. */
  readonly editable: boolean;
  readonly onCloseBorder: () => void;
  /** Opens the Changes panel, also with nothing in it. */
  readonly onChanges: () => void;
  /** Opens the shortcut help; absent on a touch screen. */
  readonly onHelp?: () => void;
}

/** The editor's ⋯ menu (DESIGN.md 6 and 9.2): close the outer walls, Changes and the shortcut help. */
export function MoreActions({ editable, onCloseBorder, onChanges, onHelp }: MoreActionsProps) {
  return (
    <DropdownMenu modal={false}>
      <Hint label="More actions" side="bottom">
        <DropdownMenuTrigger asChild>
          <IslandButton aria-label="More actions">
            <DotsThree aria-hidden size={18} />
          </IslandButton>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="z-20 min-w-56 rounded-[14px]">
        <DropdownMenuItem className="rounded-[9px]" disabled={!editable} onSelect={onCloseBorder}>
          <Square aria-hidden size={16} />
          Close outer walls
          <DropdownMenuShortcut>B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-[9px]" onSelect={onChanges}>
          <GitDiff aria-hidden size={16} />
          Changes
        </DropdownMenuItem>
        {onHelp === undefined ? null : (
          <DropdownMenuItem className="rounded-[9px]" onSelect={onHelp}>
            <Keyboard aria-hidden size={16} />
            Keyboard shortcuts
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
