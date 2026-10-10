import { Button } from '@/ui/primitives/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/ui/primitives/dialog';

/** The props of {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  /** What the button that goes ahead says. */
  readonly confirm: string;
  readonly onConfirm: () => void;
}

/** A question before something that cannot be taken back, with Cancel first (DESIGN.md 6). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogTitle translate="no">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button className="rounded-[10px]" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            className="rounded-[10px]"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
