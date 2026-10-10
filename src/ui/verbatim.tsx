import type { ReactNode } from 'react';

/** The props of {@link Verbatim}. */
export interface VerbatimProps {
  readonly text: string;
  /** The parts of `text` a translator must leave alone: maze names, paths, commits, coordinates. */
  readonly verbatim?: string | readonly string[] | undefined;
}

function escaped(part: string): string {
  return part.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `text`, with every occurrence of its `verbatim` parts marked `translate="no"` (DESIGN.md 13), so
 * a page translator turns the sentence around a name, a path or a commit and leaves them as they are.
 */
export function Verbatim({ text, verbatim }: VerbatimProps) {
  const parts = (typeof verbatim === 'string' ? [verbatim] : (verbatim ?? [])).filter(
    (part) => part !== ''
  );

  if (parts.length === 0) {
    return text;
  }

  const pattern = new RegExp(parts.map(escaped).join('|'), 'g');
  const pieces: ReactNode[] = [];
  let from = 0;

  for (const match of text.matchAll(pattern)) {
    pieces.push(text.slice(from, match.index));
    pieces.push(
      <span key={match.index} translate="no">
        {match[0]}
      </span>
    );
    from = match.index + match[0].length;
  }

  pieces.push(text.slice(from));
  return pieces;
}
