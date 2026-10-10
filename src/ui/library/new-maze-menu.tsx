import { Plus, Ruler, X } from '@/ui/icons';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { Profile } from '@/maze';
import { useCoarsePointer } from '@/ui/hooks/use-media-query';
import { PROFILE_NAMES } from '@/ui/labels';
import { IslandButton } from '@/ui/islands/island';
import { PRESETS, sideOf, type NewMazeRequest } from '@/ui/new-maze';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/primitives/dialog';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/ui/primitives/dropdown-menu';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { ToggleGroup, ToggleGroupItem } from '@/ui/primitives/toggle-group';

/** The default side of a custom maze. */
const DEFAULT_SIDE = '16';

const RANGE_ERROR = '1 to 64';

/** The props of {@link NewMazeItems}. */
export interface NewMazeItemsProps {
  readonly onNew: (request: NewMazeRequest) => void;
  /** Opens the Custom size dialog. */
  readonly onCustom: () => void;
}

/**
 * The New maze items of a menu (DESIGN.md 9.2): "Classic, 16 × 16", "Half size, 32 × 32",
 * "Training, 16 × 16" and "Custom size…".
 */
export function NewMazeItems({ onNew, onCustom }: NewMazeItemsProps) {
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">New maze</DropdownMenuLabel>
      {PRESETS.map(([preset, label]) => (
        <DropdownMenuItem
          className="rounded-[9px]"
          key={preset}
          onSelect={() => onNew({ kind: 'preset', preset })}
        >
          <Plus aria-hidden size={16} />
          {label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="rounded-[9px]" onSelect={onCustom}>
        <Ruler aria-hidden size={16} />
        Custom size…
      </DropdownMenuItem>
    </>
  );
}

interface SideFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function SideField({ label, value, onChange }: SideFieldProps) {
  const id = useId();
  const valid = sideOf(value) !== undefined;

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={valid ? undefined : `${id}-error`}
        aria-invalid={!valid}
        autoComplete="off"
        id={id}
        inputMode="numeric"
        max={64}
        min={1}
        name={label.toLowerCase()}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
      {valid ? null : (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {RANGE_ERROR}
        </p>
      )}
    </div>
  );
}

function isProfile(value: string): value is Profile {
  return PROFILE_NAMES.some(([profile]) => profile === value);
}

/** The props of {@link CustomSizeDialog}. */
export interface CustomSizeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The name it suggests, "Untitled maze" made unique. */
  readonly defaultName: string;
  readonly onCreate: (request: NewMazeRequest) => void;
}

interface CustomFormProps {
  readonly defaultName: string;
  readonly onCreate: (request: NewMazeRequest) => void;
}

function CustomForm({ defaultName, onCreate }: CustomFormProps) {
  const [width, setWidth] = useState(DEFAULT_SIDE);
  const [height, setHeight] = useState(DEFAULT_SIDE);
  const [profile, setProfile] = useState<Profile>('free');
  const [name, setName] = useState(defaultName);
  const nameId = useId();
  const columns = sideOf(width);
  const rows = sideOf(height);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (columns !== undefined && rows !== undefined) {
      onCreate({ kind: 'custom', width: columns, height: rows, profile, name });
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex gap-3">
        <SideField label="Width" onChange={setWidth} value={width} />
        <SideField label="Height" onChange={setHeight} value={height} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] leading-none font-medium" id={`${nameId}-rules`}>
          Rules
        </span>
        <ToggleGroup
          aria-labelledby={`${nameId}-rules`}
          className="flex w-full rounded-[11px] bg-muted p-[3px]"
          onValueChange={(value) => {
            if (isProfile(value)) {
              setProfile(value);
            }
          }}
          type="single"
          value={profile}
        >
          {PROFILE_NAMES.map(([value, label]) => (
            <ToggleGroupItem
              className="h-[30px] rounded-[8px] text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-island"
              key={value}
              value={value}
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          autoComplete="off"
          id={nameId}
          name="name"
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          placeholder="Untitled maze…"
          value={name}
        />
      </div>
      <Button
        className="self-end rounded-[10px]"
        disabled={columns === undefined || rows === undefined}
        type="submit"
      >
        Create
      </Button>
    </form>
  );
}

/**
 * The Custom size dialog (DESIGN.md 6 and 12): width and height of 1 to 64, each with its inline
 * "1 to 64" and Create disabled while one is out of range; the rules; and the name, "Untitled
 * maze" made unique unless changed. The width takes the focus, and Enter creates.
 */
export function CustomSizeDialog({
  open,
  onOpenChange,
  defaultName,
  onCreate,
}: CustomSizeDialogProps) {
  const content = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (coarse ? content.current : content.current?.querySelector('input'))?.focus();
        }}
        ref={content}
      >
        <div className="flex items-center">
          <DialogTitle className="flex-1">Custom size</DialogTitle>
          <DialogClose asChild>
            <IslandButton aria-label="Close">
              <X aria-hidden size={16} />
            </IslandButton>
          </DialogClose>
        </div>
        {open ? (
          <CustomForm
            defaultName={defaultName}
            onCreate={(request) => {
              onOpenChange(false);
              onCreate(request);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The props of {@link NewMazeDialogs}. */
export interface NewMazeDialogsProps {
  readonly defaultName: string;
  readonly onNew: (request: NewMazeRequest) => void;
  /** The menu, given the items to put in it. */
  readonly children: (items: ReactNode) => ReactNode;
}

/** A menu with the New maze items, and the Custom size dialog they open. */
export function NewMazeDialogs({ defaultName, onNew, children }: NewMazeDialogsProps) {
  const [custom, setCustom] = useState(false);

  return (
    <>
      {children(<NewMazeItems onCustom={() => setCustom(true)} onNew={onNew} />)}
      <CustomSizeDialog
        defaultName={defaultName}
        onCreate={onNew}
        onOpenChange={setCustom}
        open={custom}
      />
    </>
  );
}
