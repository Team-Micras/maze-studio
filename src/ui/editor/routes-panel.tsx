import { Path, Pause, Play, X } from '@/ui/icons';
import { Fragment, useId, useState, type ReactNode } from 'react';

import type { Exploration, Route, ShortestRoutes } from '@/maze';
import { EXPLORATION_COLOR, ROUTE_COLORS, TRACK_COLORS } from '@/render';
import { insideCanvas } from '@/ui/canvas-id';
import { Hint, IslandButton } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetTitle } from '@/ui/primitives/sheet';
import { Switch } from '@/ui/primitives/switch';
import { cn } from '@/ui/primitives/utils';
import {
  anyOverlayShown,
  playExploration,
  toggleOverlay,
  useExplorationPlayback,
  useOverlaySwitches,
  type OverlaySwitches,
} from '@/ui/route-switches';

/** The props of {@link Routes}. */
export interface RoutesProps {
  /** The routes of the maze on screen: `undefined` without a start or a goal, `null` out of reach. */
  readonly routes: ShortestRoutes | null | undefined;
  /** The side of a cell in metres. */
  readonly cellSize: number;
  /** The flood-fill search of the maze on screen, searched while the panel is open. */
  readonly exploration: Exploration | null | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly phone: boolean;
}

const ROWS = [
  {
    name: 'withoutDiagonals',
    heading: 'Shortest',
    label: 'Without diagonals',
    tile: 'M7 26V9Q7 7 9 7H26',
    color: ROUTE_COLORS.withoutDiagonals,
  },
  {
    name: 'withDiagonals',
    label: 'With diagonals',
    tile: 'M7 26V19L19 7H26',
    color: ROUTE_COLORS.withDiagonals,
  },
  {
    name: 'exploration',
    heading: 'Exploration',
    label: 'Flood fill · to the goal',
    tile: 'M7 26V16H16V9H25V20',
    color: EXPLORATION_COLOR,
  },
] as const;

function sameRoute(left: Route, right: Route): boolean {
  return (
    left.points.length === right.points.length &&
    left.points.every(
      ({ u, v }, index) => u === right.points[index].u && v === right.points[index].v
    )
  );
}

interface RouteRowsProps {
  /** What each row says under its name, if anything, such as the route's cells and length. */
  readonly details?: Partial<Record<keyof OverlaySwitches, string>>;
  /**
   * The search of the maze on screen, which gives its row the ▶; the library and the generator,
   * with no maze on screen, leave it out.
   */
  readonly exploration?: Exploration | null;
  /** Called once ▶ starts the search playing, as to close a phone's sheet over the board. */
  readonly onPlay?: () => void;
}

interface RowProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly tile: string;
  readonly color: string;
  readonly on: boolean;
  readonly onToggle: () => void;
  readonly detail: string | undefined;
  readonly play?: ReactNode;
}

function Row({ id, name, label, tile, color, on, onToggle, detail, play }: RowProps) {
  return (
    <label
      className={cn(
        'grid cursor-pointer items-center gap-2.5 rounded-[10px] p-2 hover:bg-muted',
        play === undefined ? 'grid-cols-[32px_1fr_auto]' : 'grid-cols-[32px_1fr_auto_auto]'
      )}
      data-route-row={name}
      htmlFor={id}
    >
      <svg
        aria-hidden
        className={cn('size-8 rounded-[7px] shadow-island', !on && 'opacity-45')}
        style={{ background: TRACK_COLORS.floor }}
        viewBox="0 0 32 32"
      >
        <path
          d={tile}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.6}
        />
      </svg>
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {detail === undefined ? null : (
          <span className="block text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      {play}
      <Switch checked={on} id={id} onCheckedChange={onToggle} />
    </label>
  );
}

function PlayButton({
  exploration,
  onPlay,
}: {
  readonly exploration: Exploration;
  readonly onPlay: (() => void) | undefined;
}) {
  const playing = useExplorationPlayback(
    (now) => now !== undefined && now.exploration === exploration && now.playing
  );

  return (
    <Button
      aria-label={playing ? 'Pause the search' : 'Play the search'}
      onClick={() => {
        playExploration(exploration);

        if (!playing) {
          onPlay?.();
        }
      }}
      size="icon-sm"
      variant="ghost"
    >
      {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
    </Button>
  );
}

function explorationDetail(exploration: Exploration): string {
  return `${exploration.moves} moves · ${exploration.cells} cells · ${Math.round(exploration.seen * 100)}% of walls seen`;
}

/**
 * A row per route, without diagonals then with them, and one for the flood-fill search: its tile,
 * its name and the session's switch.
 */
function RouteRows({ details, exploration, onPlay }: RouteRowsProps) {
  const id = useId();
  const switches = useOverlaySwitches();

  return (
    <div className="px-1 pb-2">
      {ROWS.map((row, index) => (
        <Fragment key={row.name}>
          {'heading' in row ? (
            <h3
              className={cn(
                'mx-3 mb-0.5 text-xs font-medium text-muted-foreground',
                index === 0 ? 'mt-1' : 'mt-2'
              )}
            >
              {row.heading}
            </h3>
          ) : null}
          <Row
            color={row.color}
            detail={details?.[row.name]}
            id={`${id}-${row.name}`}
            label={row.label}
            name={row.name}
            on={switches[row.name]}
            onToggle={() => toggleOverlay(row.name)}
            play={
              row.name === 'exploration' && exploration ? (
                <PlayButton exploration={exploration} onPlay={onPlay} />
              ) : undefined
            }
            tile={row.tile}
          />
        </Fragment>
      ))}
    </div>
  );
}

function routeDetail(route: Route, cellSize: number): string {
  return `${route.cells} cells · ${(route.length * cellSize).toFixed(2)} m`;
}

function Body({
  routes,
  exploration,
  cellSize,
  onPlay,
}: Omit<RoutesProps, 'open' | 'onOpenChange' | 'phone'> & { readonly onPlay?: () => void }) {
  if (routes === undefined || routes === null) {
    return (
      <p className="px-4 pt-1 pb-4 text-[13px] text-muted-foreground" data-routes-empty="">
        {routes === undefined
          ? 'Routes need a start and a goal. Mark them with the Start and Goal tools.'
          : "The goal can't be reached from the start. Open a wall to see the routes again."}
      </p>
    );
  }

  const twin = sameRoute(routes.withoutDiagonals, routes.withDiagonals);
  return (
    <RouteRows
      details={{
        withoutDiagonals: routeDetail(routes.withoutDiagonals, cellSize),
        withDiagonals: `${routeDetail(routes.withDiagonals, cellSize)}${twin ? ' · same route as without diagonals' : ''}`,
        exploration: exploration ? explorationDetail(exploration) : undefined,
      }}
      exploration={exploration}
      onPlay={onPlay}
    />
  );
}

function Head({ heading, onClose }: { readonly heading: ReactNode; readonly onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 pt-2.5 pr-2 pb-1.5 pl-4">
      {heading}
      <IslandButton aria-label="Close routes" onClick={onClose}>
        <X aria-hidden size={16} />
      </IslandButton>
    </div>
  );
}

/** The props of {@link RoutesShell}. */
interface RoutesShellProps {
  readonly phone: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Whether it has its button, an icon named Routes; a phone's sheet opened from elsewhere, as
   * the editor's ⋯ menu, has none.
   */
  readonly trigger: boolean;
  readonly children: ReactNode;
}

/**
 * The Routes popover on a notebook, open while the board is edited, and a sheet as tall as its
 * rows on a phone; its button shows active while a route or the search is drawn.
 */
function RoutesShell({ phone, open, onOpenChange, trigger, children }: RoutesShellProps) {
  const active = useOverlaySwitches(anyOverlayShown);
  const close = (): void => onOpenChange(false);
  const button = trigger ? (
    <IslandButton
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Routes"
      className={cn(active && 'bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]')}
      data-active={active ? '' : undefined}
      onClick={phone ? () => onOpenChange(true) : undefined}
    >
      <Path aria-hidden size={16} />
    </IslandButton>
  ) : null;

  if (phone) {
    return (
      <>
        {button}
        <Sheet onOpenChange={onOpenChange} open={open}>
          <SheetContent aria-describedby={undefined}>
            <Head
              heading={<SheetTitle className="flex-1 text-sm">Routes</SheetTitle>}
              onClose={close}
            />
            {children}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover modal={false} onOpenChange={onOpenChange} open={open}>
      {button === null ? null : (
        <Hint label="Routes" side="bottom">
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </Hint>
      )}
      <PopoverContent
        align="end"
        aria-label="Routes"
        className="w-[340px]"
        onInteractOutside={(event) => {
          if (insideCanvas(event.target)) {
            event.preventDefault();
          }
        }}
      >
        <Head
          heading={<h2 className="flex-1 text-sm leading-5 font-semibold">Routes</h2>}
          onClose={close}
        />
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Routes panel (DESIGN.md 6): the shortest route without diagonals and the one with them,
 * each with its cells, its length and a switch that shows it on the board, and the flood-fill
 * search, with its moves, cells and walls seen, its switch and a ▶ that plays it on the board; the
 * routes stay on the board after the panel closes, until their switches turn them off. On a
 * notebook it opens from the Routes button as a popover that stays open while the board is
 * edited; on a phone, from the ⋯ menu, as a sheet as tall as its rows, which ▶ closes.
 */
export function Routes({ phone, open, onOpenChange, ...body }: RoutesProps) {
  return (
    <RoutesShell onOpenChange={onOpenChange} open={open} phone={phone} trigger={!phone}>
      <Body {...body} onPlay={phone ? () => onOpenChange(false) : undefined} />
    </RoutesShell>
  );
}

/** The props of {@link RoutesButton}. */
export interface RoutesButtonProps {
  readonly phone: boolean;
}

/**
 * The Routes button of the library and the generator: the same rows and switches as the editor's
 * Routes panel, for the routes the whole session draws, without a maze's cells and length.
 */
export function RoutesButton({ phone }: RoutesButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <RoutesShell onOpenChange={setOpen} open={open} phone={phone} trigger>
      <RouteRows />
    </RoutesShell>
  );
}
