import { useId, useRef, useState, type FormEvent } from 'react';

import { useCoarsePointer } from '@/ui/hooks/use-media-query';
import { X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';

import { nameError } from './name-check';

/** The props of {@link RenameDialog}. */
export interface RenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The name now, which the field starts with. */
  readonly name: string;
  /** The names of the other mazes of My mazes, which this one cannot take, compared without case. */
  readonly taken: readonly string[];
  /** Renames; resolves `false` when the name could not be saved. */
  readonly onRename: (name: string) => Promise<boolean>;
}

interface FormProps {
  readonly name: string;
  readonly taken: readonly string[];
  readonly onDone: (name: string) => void;
}

function RenameForm({ name, taken, onDone }: FormProps) {
  const [value, setValue] = useState(name);
  const id = useId();
  const trimmed = value.trim();
  const error = nameError(value, taken);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (error === undefined) {
      onDone(trimmed);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Name</Label>
        <Input
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          aria-invalid={error !== undefined}
          autoComplete="off"
          id={id}
          name="name"
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          value={value}
        />
        {error === undefined ? null : (
          <p className="text-xs text-destructive" id={`${id}-error`}>
            {error}
          </p>
        )}
      </div>
      <Button className="self-end rounded-[10px]" disabled={error !== undefined} type="submit">
        Save
      </Button>
    </form>
  );
}

/**
 * Rename (DESIGN.md 6 and 12): one field, which takes the focus, Enter saves; an empty name says
 * "Name cannot be empty", a name another maze of My mazes has says "Name already in My mazes", and either
 * disables Save.
 */
export function RenameDialog({ open, onOpenChange, name, taken, onRename }: RenameDialogProps) {
  const content = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();

          if (coarse) {
            content.current?.focus();
          } else {
            content.current?.querySelector('input')?.select();
          }
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
            taken={taken}
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
