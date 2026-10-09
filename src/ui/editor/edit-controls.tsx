import { PencilSimple } from '@phosphor-icons/react';

import { Island } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';

import { ToolHint, type HintMessage } from './tool-hint';
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
 * ink island says so and the tools change nothing.
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
        <Island className="fixed top-[72px] left-4 bg-primary px-3 py-2 text-primary-foreground max-[720px]:top-safe-16 max-[720px]:left-safe-2">
          <output className="text-[13px] font-medium">
            Opened in another tab. Reload to edit.
          </output>
        </Island>
      )}
      <ToolHint
        className="max-[720px]:bottom-[calc(max(10px,env(safe-area-inset-bottom))+66px)]"
        message={hint}
      />
    </>
  );
}
