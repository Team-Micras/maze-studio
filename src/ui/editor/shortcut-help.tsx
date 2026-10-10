import { Fragment } from 'react';

import { IslandButton } from '@/ui/islands/island';
import { shortcutLabel } from '@/ui/platform';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/primitives/dialog';
import { X } from '@/ui/icons';

/** The editor's shortcuts as the help lists them (DESIGN.md 11). */
const SHORTCUTS: readonly (readonly [string, readonly string[]])[] = [
  ['Hand, wall, rectangle, clear area', ['H', 'W', 'R', 'C']],
  ['Start, goal', ['S', 'G']],
  ['Move the cell cursor', ['Arrows']],
  ['Toggle the wall on that side', ['Shift', 'Arrow']],
  ['Place the start, or mark the corners of a goal, rectangle or clear area', ['Enter']],
  ['Add or remove a goal cell', ['Shift', 'Enter']],
  ['Maze list, previous and next maze', ['L', '[', ']']],
  ['Close outer walls', ['B']],
  ['Undo, redo', ['Ctrl Z', 'Ctrl Shift Z']],
  ['Pan', ['Space', 'drag']],
  ['Zoom in, out, fit', ['+', '-', '0']],
  ['Close the list, a panel or a menu, else drop the corner, else the finding shown', ['Esc']],
  ['This help', ['?']],
];

/** The props of {@link ShortcutHelp}. */
export interface ShortcutHelpProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The shortcut help (DESIGN.md 6 and 11), a dialog that `?` opens; not offered on touch screens. */
export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="w-[min(460px,calc(100vw-24px))]">
        <div className="flex items-center">
          <DialogTitle className="flex-1">Keyboard shortcuts</DialogTitle>
          <DialogClose asChild>
            <IslandButton aria-label="Close shortcuts">
              <X aria-hidden size={16} />
            </IslandButton>
          </DialogClose>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
          {SHORTCUTS.map(([action, keys]) => (
            <Fragment key={action}>
              <dt className="text-muted-foreground">{action}</dt>
              <dd className="flex justify-end gap-1">
                {keys.map((key) => (
                  <kbd
                    className="rounded-[6px] bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                    key={key}
                  >
                    {shortcutLabel(key)}
                  </kbd>
                ))}
              </dd>
            </Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
