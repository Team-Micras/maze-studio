import { useEffect, useState } from 'react';

import { cn } from '@/ui/primitives/utils';

/** How long a hint stays, in milliseconds (DESIGN.md 6). */
export const HINT_DURATION_MS = 2600;

/** A hint to show, told apart from the same text shown before by its `at`. */
export interface HintMessage {
  readonly text: string;
  readonly at: number;
  /** Whether a screen reader is told too, as when a touch was refused. */
  readonly spoken?: boolean;
}

/** The props of {@link ToolHint}. */
export interface ToolHintProps {
  readonly message: HintMessage | undefined;
  readonly className?: string;
}

/**
 * The ink pill above the tools island (DESIGN.md 6): a short hint, such as how to draw on entering
 * edit mode or "Zoom in to edit", for 2.6 s. Decorative for a screen reader, which the controls'
 * own labels serve.
 */
export function ToolHint({ message, className }: ToolHintProps) {
  const [hidden, setHidden] = useState<HintMessage | undefined>(undefined);

  useEffect(() => {
    if (message === undefined) {
      return undefined;
    }

    const timer = window.setTimeout(() => setHidden(message), HINT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const shown = message !== undefined && hidden !== message;

  return (
    <p
      aria-hidden
      className={cn(
        'pointer-events-none fixed bottom-safe-[74px] left-1/2 z-[9] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-[9px] bg-primary px-2.5 py-[5px] text-center text-xs text-primary-foreground opacity-0 transition-opacity duration-200 ease-(--ease) data-shown:opacity-100',
        className
      )}
      data-hint=""
      data-shown={shown ? '' : undefined}
    >
      {message?.text}
    </p>
  );
}

/** The props of {@link SpokenHint}. */
export interface SpokenHintProps {
  readonly message: HintMessage | undefined;
}

/**
 * The live region that speaks the hints a screen reader must hear, such as "Zoom in to edit"
 * (DESIGN.md 13): always mounted, emptied and written again for each one, so a hint said twice is
 * spoken twice.
 */
export function SpokenHint({ message }: SpokenHintProps) {
  const [said, setSaid] = useState<HintMessage | undefined>(undefined);

  useEffect(() => {
    if (message?.spoken !== true) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => setSaid(message));
    return () => cancelAnimationFrame(frame);
  }, [message]);

  return (
    <p aria-live="polite" className="sr-only">
      {said !== undefined && said === message ? said.text : ''}
    </p>
  );
}
