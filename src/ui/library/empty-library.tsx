import { Island } from '@/ui/islands/island';

/** The props of {@link EmptyLibrary}. */
export interface EmptyLibraryProps {
  /** Whether Mine is the source and holds nothing, rather than a filter finding nothing. */
  readonly mineIsEmpty: boolean;
}

/** What the library says when it shows no maze (DESIGN.md 12). */
export function EmptyLibrary({ mineIsEmpty }: EmptyLibraryProps) {
  return (
    <Island
      aria-live="polite"
      className="fixed top-1/2 left-1/2 w-[min(340px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-3 rounded-[18px] p-5 text-[13px]"
    >
      <h2 className="text-[15px] leading-5 font-semibold">
        {mineIsEmpty ? 'Nothing in Mine yet' : 'No mazes match'}
      </h2>
      <p className="text-pretty text-muted-foreground">
        {mineIsEmpty
          ? 'Edit any maze from the repo and your copy lands here, saved in this browser.'
          : 'Try another name, or clear the category.'}
      </p>
    </Island>
  );
}
