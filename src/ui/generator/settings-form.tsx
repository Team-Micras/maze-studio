import { useId, useRef, useState, type ReactNode } from 'react';

import { PRESETS, resize, type Preset, type Settings } from '@/generator';
import { ArrowCounterClockwise, CaretDown } from '@/ui/icons';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Switch } from '@/ui/primitives/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/primitives/toggle-group';

import {
  COPY,
  fieldBlocked,
  fieldBounds,
  fieldHint,
  fieldValues,
  isCustom,
  LEVEL_KEYS,
  levelOf,
  MODES,
  modeHint,
  modeOf,
  MOTIF_MODES,
  PAIRS,
  presetSettings,
  readField,
  RULE_MODES,
  ruleHint,
  ruleOn,
  RULES,
  rulesCount,
  SCORINGS,
  scoringOf,
  setLevel,
  setMode,
  setRule,
  setScoring,
  styleNote,
  trapNote,
  TUNING_FIELDS,
  type FieldKey,
  type ModeKey,
  type RuleKey,
} from './settings-model';

/** The settings the form holds and the preset they started from. */
export interface GeneratorChoice {
  readonly preset: Preset;
  readonly settings: Settings;
}

/** The props of {@link SettingsForm}. */
export interface SettingsFormProps {
  readonly value: GeneratorChoice;
  /** After every valid change. */
  readonly onChange: (value: GeneratorChoice) => void;
  /** Whether a number field holds text that does not read, which keeps Generate off. */
  readonly onInvalid: (invalid: boolean) => void;
}

const HINT = 'text-xs leading-4 text-muted-foreground';

const NOTE = 'text-xs leading-4 text-amber-700 dark:text-amber-400';

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly value: T | undefined;
  readonly options: readonly (readonly [T, ReactNode])[];
  readonly onChange: (value: T) => void;
  readonly describedBy?: string;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  describedBy,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      aria-describedby={describedBy}
      aria-label={label}
      className="flex w-full rounded-[11px] bg-muted p-[3px]"
      onValueChange={(next) => {
        const option = options.find(([key]) => key === next);

        if (option !== undefined) {
          onChange(option[0]);
        }
      }}
      type="single"
      value={value ?? ''}
    >
      {options.map(([key, text]) => (
        <ToggleGroupItem
          className="h-[30px] rounded-[8px] px-2 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-island"
          key={key}
          value={key}
        >
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface NumberFieldProps {
  readonly settings: Settings;
  readonly field: FieldKey;
  readonly onChange: (settings: Settings) => void;
  readonly onInvalid: (field: FieldKey, invalid: boolean) => void;
  readonly before?: ReactNode;
}

/**
 * A number field, a range or one number: it shows the settings' values until typed in, then the
 * text typed, with the range error under it while that text does not read.
 */
function NumberField({ settings, field, onChange, onInvalid, before }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<readonly string[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const values = fieldValues(settings, field);
  const texts = draft ?? values.map(String);
  const [min, max] = fieldBounds(settings, field);
  const blocked = fieldBlocked(settings, field);
  const hint = fieldHint(settings, field);
  const pair = PAIRS.has(field);
  const label = COPY.fields[field];
  const describedBy = [
    hint.text === '' ? '' : `${id}-hint`,
    error === undefined ? '' : `${id}-error`,
  ]
    .filter((part) => part !== '')
    .join(' ');
  const change = (index: number, text: string): void => {
    const next = texts.map((current, k) => (k === index ? text : current));
    const read = readField(settings, field, next);
    setDraft(next);
    setError(read.ok ? undefined : read.error);
    onInvalid(field, !read.ok);

    if (read.ok) {
      onChange(read.settings);
    }
  };
  const input = (index: number, name: string) => (
    <Input
      aria-describedby={describedBy === '' ? undefined : describedBy}
      aria-invalid={error !== undefined}
      aria-label={pair ? `${label}, ${name.toLowerCase()}` : undefined}
      autoComplete="off"
      className="h-8 font-mono text-[13px]"
      disabled={blocked}
      id={pair ? undefined : id}
      inputMode="numeric"
      max={max}
      min={min}
      onBlur={() => {
        if (error === undefined) {
          setDraft(undefined);
        }
      }}
      onChange={(event) => change(index, event.target.value)}
      type="number"
      value={texts[index] ?? ''}
    />
  );

  return (
    <div
      className="flex flex-col gap-1.5"
      role={pair ? 'group' : undefined}
      aria-labelledby={pair ? `${id}-label` : undefined}
    >
      {pair ? (
        <span className="text-[13px] leading-none font-medium" id={`${id}-label`}>
          {label}
        </span>
      ) : (
        <label className="text-[13px] leading-none font-medium" htmlFor={id}>
          {label}
        </label>
      )}
      {before}
      {pair ? (
        <div className="flex items-center gap-2">
          {input(0, COPY.from)}
          <span aria-hidden className="text-xs text-muted-foreground">
            {COPY.between}
          </span>
          {input(1, COPY.to)}
        </div>
      ) : (
        input(0, label)
      )}
      {hint.text === '' ? null : (
        <p className={hint.warning ? NOTE : HINT} id={`${id}-hint`}>
          {hint.text}
        </p>
      )}
      {error === undefined ? null : (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

interface ModeFieldProps {
  readonly value: GeneratorChoice;
  readonly mode: ModeKey;
  readonly onChange: (settings: Settings) => void;
}

function ModeField({ value, mode, onChange }: ModeFieldProps) {
  const id = useId();
  const { settings, preset } = value;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] leading-none font-medium" id={`${id}-label`}>
        {COPY.modeTitle[mode]}
      </span>
      <Segmented
        describedBy={`${id}-hint`}
        label={COPY.modeTitle[mode]}
        onChange={(next) => onChange(setMode(settings, mode, next, preset))}
        options={MODES.map((key) => [key, COPY.modes[key]] as const)}
        value={modeOf(settings, mode)}
      />
      <p className={HINT} id={`${id}-hint`}>
        {modeHint(settings, mode)}
      </p>
    </div>
  );
}

interface RuleFieldProps {
  readonly settings: Settings;
  readonly rule: RuleKey | 'goal';
  readonly onChange: (settings: Settings) => void;
}

function RuleField({ settings, rule, onChange }: RuleFieldProps) {
  const id = useId();
  const hint = ruleHint(settings, rule);

  return (
    <div className="flex items-start gap-3">
      <Switch
        aria-describedby={hint === '' ? undefined : `${id}-hint`}
        checked={ruleOn(settings, rule)}
        className="mt-0.5"
        id={id}
        onCheckedChange={(on) => onChange(setRule(settings, rule, on))}
      />
      <div className="flex flex-col gap-0.5">
        <label className="text-[13px] leading-5 font-medium" htmlFor={id}>
          {COPY.rules[rule][0]}
        </label>
        {hint === '' ? null : (
          <p className={HINT} id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

interface FoldProps {
  readonly title: string;
  readonly detail?: string;
  readonly children: ReactNode;
}

function Fold({ title, detail, children }: FoldProps) {
  return (
    <details className="group/fold rounded-[12px] border">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[12px] px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <b className="font-semibold">{title}</b>
        {detail === undefined ? null : <span className="text-muted-foreground">{detail}</span>}
        <CaretDown
          aria-hidden
          className="ml-auto transition-transform group-open/fold:rotate-180"
          size={14}
        />
      </summary>
      <div className="flex flex-col gap-4 px-3 pt-1 pb-3">{children}</div>
    </details>
  );
}

/**
 * The generator's settings (the mockup's settings form): the preset with its source and a reset
 * once a field moved off it, the board size, the shortest path, the longest straight and
 * diagonal by level or moves, the sensor motifs as Always / Mix / Don't require, the Rules (the
 * route choice and search traps, the switches with Never trivial, and the scoring) and the Fine
 * tuning of every other target. Each number field checks its range as it is typed.
 */
export function SettingsForm({ value, onChange, onInvalid }: SettingsFormProps) {
  const id = useId();
  const [invalid, setInvalid] = useState<ReadonlySet<FieldKey>>(new Set());
  const [reset, setReset] = useState(0);
  const presetField = useRef<HTMLSelectElement>(null);
  const { preset, settings } = value;
  const custom = isCustom(settings, preset);
  const change = (next: Settings): void => onChange({ preset, settings: next });
  const replace = (next: GeneratorChoice): void => {
    setInvalid(new Set());
    onInvalid(false);
    setReset((count) => count + 1);
    onChange(next);
  };
  const markInvalid = (field: FieldKey, bad: boolean): void => {
    const next = new Set(invalid);

    if (bad) {
      next.add(field);
    } else {
      next.delete(field);
    }

    setInvalid(next);
    onInvalid(next.size > 0);
  };
  const number = (field: FieldKey, before?: ReactNode) => (
    <NumberField
      before={before}
      field={field}
      key={`${field}-${reset}`}
      onChange={change}
      onInvalid={markInvalid}
      settings={settings}
    />
  );
  const level = (key: 'straights' | 'diagonals') => (
    <Segmented
      label={COPY.fields[key]}
      onChange={(next) => change(setLevel(settings, key, next))}
      options={LEVEL_KEYS.map((k) => [k, COPY.levels[k]] as const)}
      value={levelOf(settings, key)}
    />
  );
  const style = styleNote(settings);
  const trap = trapNote(settings);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] leading-none font-medium" htmlFor={`${id}-preset`}>
          {COPY.preset}
        </label>
        <div className="flex gap-2">
          <select
            aria-describedby={`${id}-source`}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[13px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
            id={`${id}-preset`}
            ref={presetField}
            onChange={(event) => {
              const next = PRESETS.find((p) => p.id === event.target.value);

              if (next !== undefined) {
                replace({ preset: next, settings: presetSettings(next) });
              }
            }}
            value={custom ? '' : preset.id}
          >
            {custom ? <option value="">{COPY.custom(preset.label)}</option> : null}
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {custom ? (
            <Button
              className="h-8 rounded-[10px] text-[13px]"
              onClick={() => {
                replace({ preset, settings: presetSettings(preset, settings.size) });
                presetField.current?.focus();
              }}
              type="button"
              variant="outline"
            >
              <ArrowCounterClockwise aria-hidden />
              {COPY.reset(preset.label)}
            </Button>
          ) : null}
        </div>
        <p className={HINT} id={`${id}-source`}>
          {preset.source}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] leading-none font-medium">{COPY.size}</span>
        <Segmented
          label={COPY.size}
          onChange={(size) => {
            replace({
              preset,
              settings: structuredClone(resize(settings, size === '32' ? 32 : 16)),
            });
          }}
          options={[
            [
              '16',
              <span className="font-mono" key="16">
                16 × 16
              </span>,
            ],
            [
              '32',
              <span className="font-mono" key="32">
                32 × 32
              </span>,
            ],
          ]}
          value={settings.size === 32 ? '32' : '16'}
        />
        {settings.size === 32 ? <p className={NOTE}>{COPY.sizeNote}</p> : null}
      </div>
      {number('path')}
      {number('straights', level('straights'))}
      {number('diagonals', level('diagonals'))}
      {MOTIF_MODES.map((mode) => (
        <ModeField key={mode} mode={mode} onChange={change} value={value} />
      ))}
      {style === undefined ? null : <p className={NOTE}>{style}</p>}
      <Fold detail={rulesCount(settings)} title={COPY.rulesTitle}>
        {RULE_MODES.map((mode) => (
          <ModeField key={mode} mode={mode} onChange={change} value={value} />
        ))}
        {trap === undefined ? null : <p className={NOTE}>{trap}</p>}
        {RULES.map((rule) => (
          <RuleField key={rule} onChange={change} rule={rule} settings={settings} />
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] leading-none font-medium">{COPY.scoring}</span>
          <Segmented
            describedBy={`${id}-scoring`}
            label={COPY.scoring}
            onChange={(next) => change(setScoring(settings, next))}
            options={SCORINGS.map((k) => [k, COPY.scorings[k]] as const)}
            value={scoringOf(settings)}
          />
          <p className={HINT} id={`${id}-scoring`}>
            {COPY.scoringHint[scoringOf(settings)]}
          </p>
        </div>
      </Fold>
      <Fold title={COPY.tuning}>
        {TUNING_FIELDS.map((field) =>
          field === 'goal' ? (
            <RuleField key={field} onChange={change} rule="goal" settings={settings} />
          ) : (
            number(field)
          )
        )}
      </Fold>
    </div>
  );
}
