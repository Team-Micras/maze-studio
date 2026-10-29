import { Island } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';

import { NewMazeMenu } from './new-maze-button';

/** The props of {@link EmptyLibrary}. */
export interface EmptyLibraryProps {
  /** Whether My mazes is the source and holds nothing, rather than a filter finding nothing. */
  readonly mineIsEmpty: boolean;
  /** What the library says, which the studio also announces. */
  readonly title: string;
  /** Opens a new maze in the editor, from the New maze button of an empty My mazes. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** Opens Generate in the editor on a new blank maze. */
  readonly onGenerate?: () => void;
  /** The name a new maze gets unless named. */
  readonly newName: string;
}

/** What the library says when it shows no maze (DESIGN.md 12); an empty My mazes offers a new maze. */
export function EmptyLibrary({
  mineIsEmpty,
  title,
  onNew,
  onGenerate,
  newName,
}: EmptyLibraryProps) {
  return (
    <Island className="fixed top-1/2 left-1/2 w-[min(340px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-3 rounded-[18px] p-5 text-[13px]">
      <h2 className="text-[15px] leading-5 font-semibold">{title}</h2>
      <p className="text-pretty text-muted-foreground">
        {mineIsEmpty
          ? 'Edit any maze from the repo and your copy lands here, saved in this browser.'
          : 'Try another name, or clear the category.'}
      </p>
      {mineIsEmpty ? (
        <NewMazeMenu align="start" newName={newName} onGenerate={onGenerate} onNew={onNew} />
      ) : null}
    </Island>
  );
}
