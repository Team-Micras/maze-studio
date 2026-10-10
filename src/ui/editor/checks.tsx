import { CheckCircle, Info, Warning, WarningCircle, X, type Icon } from '@/ui/icons';
import { useState, type ReactNode } from 'react';

import type { Finding, Profile, Severity } from '@/maze';
import { CANVAS_ID } from '@/ui/canvas-id';
import { IslandButton } from '@/ui/islands/island';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/ui/primitives/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/ui/primitives/toggle-group';
import { cn } from '@/ui/primitives/utils';

import { PROFILE_NAMES } from '@/ui/labels';

import { checksSummary, findingKey, passesText, type ChecksLevel } from './checks-summary';

/** The props of {@link Checks}. */
export interface ChecksProps {
  readonly findings: readonly Finding[];
  readonly profile: Profile;
  readonly onProfile: (profile: Profile) => void;
  /** The key of the finding shown on the board, if any. */
  readonly selected: string | undefined;
  /** Shows a finding on the board, or none. */
  readonly onSelect: (finding: Finding | undefined, key: string | undefined) => void;
  readonly phone: boolean;
}

const LEVEL_ICONS: Readonly<Record<ChecksLevel, Icon>> = {
  error: WarningCircle,
  warning: Warning,
  ok: CheckCircle,
};

const LEVEL_COLORS: Readonly<Record<ChecksLevel, string>> = {
  error: 'text-destructive',
  warning: 'text-warning',
  ok: 'text-success',
};

const SEVERITY_ICONS: Readonly<Record<Severity, Icon>> = {
  error: WarningCircle,
  warning: Warning,
  hint: Info,
};

const SEVERITY_COLORS: Readonly<Record<Severity, string>> = {
  error: 'text-destructive',
  warning: 'text-warning',
  hint: 'text-muted-foreground',
};

const SEVERITY_NAMES: Readonly<Record<Severity, string>> = {
  error: 'Error',
  warning: 'Warning',
  hint: 'Hint',
};

function isProfile(value: string): value is Profile {
  return PROFILE_NAMES.some(([profile]) => profile === value);
}

interface PanelProps extends Omit<ChecksProps, 'phone'> {
  readonly onClose: () => void;
  readonly heading: ReactNode;
}

function Panel({ findings, profile, onProfile, selected, onSelect, onClose, heading }: PanelProps) {
  return (
    <>
      <div className="flex items-center gap-2 pt-2.5 pr-2 pb-1.5 pl-4">
        {heading}
        <IslandButton aria-label="Close checks" onClick={onClose}>
          <X aria-hidden size={16} />
        </IslandButton>
      </div>
      <ToggleGroup
        aria-label="Rules"
        className="mx-3 mb-2 flex w-auto rounded-[11px] bg-muted p-[3px]"
        onValueChange={(value) => {
          if (isProfile(value)) {
            onProfile(value);
          }
        }}
        type="single"
        value={profile}
      >
        {PROFILE_NAMES.map(([value, name]) => (
          <ToggleGroupItem
            className="h-[30px] rounded-[8px] text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-island"
            key={value}
            value={value}
          >
            {name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ul className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pt-1 pb-2.5">
        {findings.length === 0 ? (
          <li className="flex gap-2.5 px-2 pt-2.5 pb-1.5 text-[13px] text-muted-foreground">
            <CheckCircle aria-hidden className="mt-px flex-none text-success" size={16} />
            {passesText(profile)}
          </li>
        ) : (
          findings.map((finding, index) => {
            const key = findingKey(finding, index);
            const SeverityIcon = SEVERITY_ICONS[finding.severity];
            const pressed = key === selected;
            return (
              <li key={key}>
                <button
                  aria-pressed={pressed}
                  className={cn(
                    'grid w-full grid-cols-[18px_1fr] gap-x-2.5 rounded-[10px] px-2 py-[9px] text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                    pressed && 'bg-muted shadow-[inset_2px_0_0_var(--track-focus)]'
                  )}
                  data-finding={finding.rule}
                  onClick={() => onSelect(pressed ? undefined : finding, pressed ? undefined : key)}
                  type="button"
                >
                  <SeverityIcon
                    aria-hidden
                    className={cn('mt-px', SEVERITY_COLORS[finding.severity])}
                    size={16}
                  />
                  <span>{finding.message}</span>
                  <small className="col-start-2 text-xs text-muted-foreground">
                    {SEVERITY_NAMES[finding.severity]}
                  </small>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}

function insideCanvas(target: EventTarget | null): boolean {
  return target instanceof Node && document.getElementById(CANVAS_ID)?.contains(target) === true;
}

/**
 * The Checks chip and its panel (DESIGN.md 6, 12 and 13): the chip says "2 errors", "1 warning" or
 * "Passes", only the count on a phone, and a live region beside it says "Checks: 2 errors"; the panel lists the findings under the profile chosen, and a finding
 * clicked is shown on the board. On a notebook the panel is a popover that stays open while the
 * board is edited; on a phone it is a sheet, which a finding clicked closes to show the board.
 */
export function Checks({ findings, profile, onProfile, selected, onSelect, phone }: ChecksProps) {
  const [open, setOpen] = useState(false);
  const summary = checksSummary(findings);
  const LevelIcon = LEVEL_ICONS[summary.level];
  const chip = (
    <IslandButton
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`Checks: ${summary.label}`}
      data-checks={summary.level}
      onClick={phone ? () => setOpen(true) : undefined}
    >
      <LevelIcon aria-hidden className={LEVEL_COLORS[summary.level]} size={16} />
      <span aria-hidden className={phone ? 'font-mono tabular-nums' : undefined}>
        {phone ? summary.count || null : summary.label}
      </span>
    </IslandButton>
  );
  const spoken = (
    <span aria-live="polite" className="sr-only">
      Checks: {summary.label}
    </span>
  );
  const close = (): void => setOpen(false);

  if (phone) {
    return (
      <>
        {chip}
        {spoken}
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetContent aria-describedby={undefined} className="max-h-[62dvh]">
            <Panel
              findings={findings}
              heading={<SheetTitle className="flex-1 text-sm">Checks</SheetTitle>}
              onClose={close}
              onProfile={onProfile}
              onSelect={(finding, key) => {
                onSelect(finding, key);
                close();
              }}
              profile={profile}
              selected={selected}
            />
            <SheetDescription className="sr-only">
              The checks of the maze and its rules.
            </SheetDescription>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{chip}</PopoverTrigger>
      {spoken}
      <PopoverContent
        align="end"
        aria-label="Checks"
        className="flex max-h-[calc(100dvh-160px)] w-[340px] flex-col overflow-hidden"
        onInteractOutside={(event) => {
          if (insideCanvas(event.target)) {
            event.preventDefault();
          }
        }}
      >
        <Panel
          findings={findings}
          heading={<h2 className="flex-1 text-sm leading-5 font-semibold">Checks</h2>}
          onClose={close}
          onProfile={onProfile}
          onSelect={onSelect}
          profile={profile}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
