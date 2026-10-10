import { Island } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';

import { emptyTitle } from './empty-title';
import { NewMazeMenu } from './new-maze-button';

/** The props of {@link EmptyLibrary}. */
export interface EmptyLibraryProps {
  /** Whether Mine is the source and holds nothing, rather than a filter finding nothing. */
  readonly mineIsEmpty: boolean;
  /** Opens a new maze in the editor, from the New maze button of an empty Mine. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** The name a new maze gets unless named. */
  readonly newName: string;
}

/** What the library says when it shows no maze (DESIGN.md 12); an empty Mine offers a new maze. */
export function EmptyLibrary({ mineIsEmpty, onNew, newName }: EmptyLibraryProps) {
  return (
    <Island className="fixed top-1/2 left-1/2 w-[min(340px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-3 rounded-[18px] p-5 text-[13px]">
      <h2 className="text-[15px] leading-5 font-semibold">{emptyTitle(mineIsEmpty)}</h2>
      <p className="text-pretty text-muted-foreground">
        {mineIsEmpty
          ? 'Edit any maze from the repo and your copy lands here, saved in this browser.'
          : 'Try another name, or clear the category.'}
      </p>
      {mineIsEmpty ? <NewMazeMenu align="start" newName={newName} onNew={onNew} /> : null}
    </Island>
  );
}
