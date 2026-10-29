import { Plus } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';

import { NewMazeDialogs } from './new-maze-menu';

/** The props of {@link NewMazeMenu}. */
export interface NewMazeMenuProps {
  /** Opens a new maze in the editor. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** The name a new maze gets unless named. */
  readonly newName: string;
  /** Where the menu opens against the button. */
  readonly align?: 'start' | 'center' | 'end';
  /** Opens Generate in the editor on a new blank maze (`NewMazeDialogs`). */
  readonly onGenerate?: () => void;
}

/** The New maze button and its menu of sizes (DESIGN.md 6.1). */
export function NewMazeMenu({ onNew, newName, align = 'end', onGenerate }: NewMazeMenuProps) {
  return (
    <NewMazeDialogs defaultName={newName} onGenerate={onGenerate} onNew={onNew}>
      {(items) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IslandButton variant="default">
              <Plus aria-hidden size={16} />
              New maze
            </IslandButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="z-20 min-w-52 rounded-[14px]">
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </NewMazeDialogs>
  );
}
