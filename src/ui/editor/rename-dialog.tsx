import { useId, useRef, useState, type FormEvent } from 'react';

import { X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';

/** What the dialog says of an empty name (DESIGN.md 12). */
const EMPTY_NAME = 'Name cannot be empty';

/** The props of {@link RenameDialog}. */
export interface RenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The name now, which the field starts with. */
  readonly name: string;
  /** Renames; resolves `false` when the name could not be saved. */
  readonly onRename: (name: string) => Promise<boolean>;
}

interface FormProps {
  readonly name: string;
  readonly onDone: (name: string) => void;
}

function RenameForm({ name, onDone }: FormProps) {
  const [value, setValue] = useState(name);
  const id = useId();
  const empty = value.trim() === '';
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (!empty) {
      onDone(value.trim());
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Name</Label>
        <Input
          aria-describedby={empty ? `${id}-error` : undefined}
          aria-invalid={empty}
          id={id}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
        {empty ? (
          <p className="text-xs text-destructive" id={`${id}-error`}>
            {EMPTY_NAME}
          </p>
        ) : null}
      </div>
      <Button className="self-end rounded-[10px]" disabled={empty} type="submit">
        Save
      </Button>
    </form>
  );
}

/**
 * Rename (DESIGN.md 6 and 12): one field, which takes the focus, Enter saves, and an empty name
 * says "Name cannot be empty" and disables Save.
 */
export function RenameDialog({ open, onOpenChange, name, onRename }: RenameDialogProps) {
  const content = useRef<HTMLDivElement>(null);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.querySelector('input')?.select();
        }}
        ref={content}
      >
        <div className="flex items-center">
          <DialogTitle className="flex-1">Rename</DialogTitle>
          <DialogClose asChild>
            <IslandButton aria-label="Close">
              <X aria-hidden size={16} />
            </IslandButton>
          </DialogClose>
        </div>
        {open ? (
          <RenameForm
            name={name}
            onDone={(next) => {
              onOpenChange(false);
              void onRename(next);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
