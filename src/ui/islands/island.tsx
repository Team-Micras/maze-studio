import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/ui/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import { cn } from '@/ui/primitives/utils';
import { Verbatim } from '@/ui/verbatim';

/**
 * A floating island (DESIGN.md 5 and 6): card surface, 14 px corners, 4 px padding, 2 px gaps,
 * a hairline ring and the island shadow.
 */
export function Island({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'z-10 flex items-center gap-0.5 rounded-[14px] bg-card p-1 text-card-foreground shadow-island',
        className
      )}
      {...props}
    />
  );
}

/**
 * A button inside an island: ghost by default, 36 px tall (40 px on a phone), 10 px corners, and
 * a small press.
 */
export function IslandButton({
  className,
  variant = 'ghost',
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'h-9 min-w-9 gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-[background-color,transform] duration-100 ease-(--ease) active:scale-[0.97] max-[720px]:h-10 max-[720px]:min-w-10 has-[>svg]:px-2.5',
        className
      )}
      variant={variant}
      {...props}
    />
  );
}

/** A 1 × 20 px separator between groups of an island. */
export function IslandSeparator({ className }: { readonly className?: string }) {
  return <span aria-hidden className={cn('mx-1 h-5 w-px flex-none bg-border', className)} />;
}

/** The props of {@link Hint}. */
export interface HintProps {
  /** What the control does. */
  readonly label: string;
  /** The parts of the label a page translator must leave alone, such as a file name. */
  readonly verbatim?: string | undefined;
  /** Its key, shown after the label in mono. */
  readonly shortcut?: string;
  readonly side?: 'top' | 'bottom';
  readonly children: ReactNode;
}

/** A tooltip with a control's name and its key (DESIGN.md 6). */
export function Hint({ label, verbatim, shortcut, side = 'top', children }: HintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="text-xs font-medium" side={side} sideOffset={8}>
        <Verbatim text={label} verbatim={verbatim} />
        {shortcut === undefined ? null : (
          <kbd className="ml-3 font-mono text-[11px] text-background/70">{shortcut}</kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
