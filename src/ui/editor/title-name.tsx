import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { nameError } from './name-check';

/** What renaming from the title needs: the other names, and the rename itself. */
export interface TitleRename {
  /** The names of the other mazes of My mazes, which this one cannot take, compared without case. */
  readonly taken: readonly string[];
  /** Renames; resolves `false` when the name could not be saved. */
  readonly onRename: (name: string) => Promise<boolean>;
}

/** The props of {@link TitleName}. */
export interface TitleNameProps {
  readonly name: string;
  /** How to rename the maze, for a maze of My mazes; without it the title is plain text. */
  readonly rename?: TitleRename | undefined;
}

const TITLE = 'truncate text-[13px] leading-[18px] font-semibold';

/**
 * The open maze's name at the top left (DESIGN.md 9.2). For a maze of My mazes a click turns it
 * into a field: Enter saves, as Rename does, refusing an empty name or one another maze of My
 * mazes has, and Escape or leaving the field puts the name back.
 */
export function TitleName({ name, rename }: TitleNameProps) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const error =
    draft === undefined || rename === undefined ? undefined : nameError(draft, rename.taken);

  if (rename === undefined) {
    return (
      <h1 className={TITLE} translate="no">
        {name}
      </h1>
    );
  }

  const stop = (): void => {
    setDraft(undefined);
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  };

  const save = async (): Promise<void> => {
    if (draft === undefined || error !== undefined) {
      return;
    }

    const trimmed = draft.trim();
    stop();

    if (trimmed !== name) {
      await rename.onRename(trimmed);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  };

  if (draft === undefined) {
    return (
      <>
        <h1 className={TITLE}>
          <button
            aria-describedby={`${id}-how`}
            className="max-w-full truncate rounded-[6px] px-1 -mx-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDraft(name)}
            ref={button}
            translate="no"
            type="button"
          >
            {name}
          </button>
        </h1>
        <span hidden id={`${id}-how`}>
          Click to rename
        </span>
      </>
    );
  }

  return (
    <div className="relative min-w-0">
      <input
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        aria-invalid={error !== undefined}
        aria-label="Maze name"
        autoComplete="off"
        className="-mx-1 h-[22px] w-[min(240px,40vw)] rounded-[6px] bg-muted px-1 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive"
        name="name"
        onBlur={stop}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={onKeyDown}
        ref={(element) => element?.focus({ preventScroll: true })}
        spellCheck={false}
        translate="no"
        value={draft}
      />
      {error === undefined ? null : (
        <p
          className="absolute top-[calc(100%+10px)] left-0 rounded-[8px] bg-destructive px-2 py-1 text-xs whitespace-nowrap text-white shadow-island"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
