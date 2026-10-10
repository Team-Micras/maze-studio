import { PencilSimple } from '@/ui/icons';

import { Island } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';

import { SpokenHint, ToolHint, type HintMessage } from './tool-hint';
import { NEWER_ELSEWHERE } from './use-maze-editor';
import { ToolsIsland, type ToolsIslandProps } from './tools-island';

/** The props of {@link EditControls}. */
export interface EditControlsProps extends Omit<ToolsIslandProps, 'onView' | 'className'> {
  /** Whether the maze is open to look at, with the Edit button in place of the tools. */
  readonly viewing: boolean;
  /** Whether a touch opened it, so that the tools offer the way back to view mode. */
  readonly touchMode: boolean;
  readonly onEdit: () => void;
  readonly onView: () => void;
  readonly hint: HintMessage | undefined;
}

/**
 * The bottom centre of an open maze (DESIGN.md 9.2 and 9.3): the tools, or, in view mode, the Edit
 * button that brings them; and the hint above them. While another tab holds a newer version, an
 * ink island says so, through a live region that stays mounted, and the tools change nothing.
 */
export function EditControls({
  viewing,
  touchMode,
  onEdit,
  onView,
  hint,
  ...tools
}: EditControlsProps) {
  return (
    <>
      {viewing ? (
        <Button
          className="fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-1/2 z-10 h-12 -translate-x-1/2 gap-2 rounded-[14px] px-5 text-[14px] font-semibold shadow-island active:scale-[0.97]"
          onClick={onEdit}
        >
          <PencilSimple aria-hidden size={18} />
          Edit
        </Button>
      ) : (
        <ToolsIsland
          {...tools}
          className="max-[720px]:bottom-[max(10px,env(safe-area-inset-bottom))]"
          {...(tools.phone || touchMode ? { onView } : {})}
        />
      )}
      {tools.editable ? null : (
        <Island
          aria-hidden
          className="fixed top-safe-[72px] left-safe-4 bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground max-[720px]:top-safe-16 max-[720px]:left-safe-2"
        >
          {NEWER_ELSEWHERE}
        </Island>
      )}
      <p aria-live="polite" className="sr-only">
        {tools.editable ? '' : NEWER_ELSEWHERE}
      </p>
      <SpokenHint message={hint} />
      <ToolHint
        className="max-[720px]:bottom-[calc(max(10px,env(safe-area-inset-bottom))+66px)]"
        message={hint}
      />
    </>
  );
}
