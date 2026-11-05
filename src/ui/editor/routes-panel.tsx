import { Path, Pause, Play, X } from '@/ui/icons';
import { useId, useState, type ReactNode } from 'react';

import type { Exploration, Route, RouteSwitches, ShortestRoutes } from '@/maze';
import { EXPLORATION_COLOR, ROUTE_COLORS, TRACK_COLORS } from '@/render';
import { insideCanvas } from '@/ui/canvas-id';
import { Hint, IslandButton } from '@/ui/islands/island';
import { Button } from '@/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetTitle } from '@/ui/primitives/sheet';
import { Switch } from '@/ui/primitives/switch';
import { cn } from '@/ui/primitives/utils';
import {
  anyRouteShown,
  playExploration,
  toggleExploration,
  toggleRoute,
  useExplorationPlayback,
  useShownRoutes,
} from '@/ui/route-switches';

/** The props of {@link Routes}. */
export interface RoutesProps {
  /** The routes of the maze on screen: `undefined` without a start or a goal, `null` out of reach. */
  readonly routes: ShortestRoutes | null | undefined;
  /** The side of a cell in metres. */
  readonly cellSize: number;
  /** Which routes the board draws. */
  readonly shown: RouteSwitches;
  /** The flood-fill search of the maze on screen, searched while the panel is open. */
  readonly exploration: Exploration | null | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onToggle: (name: keyof ShortestRoutes) => void;
  readonly phone: boolean;
}

const ROWS = [
  {
    name: 'withoutDiagonals',
    label: 'Without diagonals',
    tile: 'M7 26V9Q7 7 9 7H26',
  },
  { name: 'withDiagonals', label: 'With diagonals', tile: 'M7 26V19L19 7H26' },
] as const;

const EXPLORATION_TILE = 'M7 26V16H16V9H25V20';

function sameRoute(left: Route, right: Route): boolean {
  return JSON.stringify(left.points) === JSON.stringify(right.points);
}

/** The props of {@link RouteRows}. */
export interface RouteRowsProps {
  /** Which routes are drawn. */
  readonly shown: RouteSwitches;
  readonly onToggle: (name: keyof ShortestRoutes) => void;
  /** What each row says under its name, if anything, such as the route's cells and length. */
  readonly details?: Readonly<Record<keyof ShortestRoutes, string>>;
  /**
   * The search of the maze on screen, which gives its row its moves, cells and walls seen and
   * its ▶; the library and the generator, with no maze on screen, leave it out.
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
 * its name and its switch.
 */
export function RouteRows({ shown, onToggle, details, exploration, onPlay }: RouteRowsProps) {
  const id = useId();
  const exploring = useShownRoutes((now) => now.exploration);

  return (
    <div className="px-1 pb-2">
      <h3 className="mx-3 mt-1 mb-0.5 text-xs font-medium text-muted-foreground">Shortest</h3>
      {ROWS.map(({ name, label, tile }) => (
        <Row
          color={ROUTE_COLORS[name]}
          detail={details?.[name]}
          id={`${id}-${name}`}
          key={name}
          label={label}
          name={name}
          on={shown[name]}
          onToggle={() => onToggle(name)}
          tile={tile}
        />
      ))}
      <h3 className="mx-3 mt-2 mb-0.5 text-xs font-medium text-muted-foreground">Exploration</h3>
      <Row
        color={EXPLORATION_COLOR}
        detail={exploration ? explorationDetail(exploration) : undefined}
        id={`${id}-exploration`}
        label="Flood fill · to the goal"
        name="exploration"
        on={exploring}
        onToggle={toggleExploration}
        play={exploration ? <PlayButton exploration={exploration} onPlay={onPlay} /> : undefined}
        tile={EXPLORATION_TILE}
      />
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
  shown,
  onToggle,
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
      }}
      exploration={exploration}
      onPlay={onPlay}
      onToggle={onToggle}
      shown={shown}
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
  const active = useShownRoutes((now) => anyRouteShown(now.shown) || now.exploration);
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
 * routes stay on the board after the panel closes, until their switches turn them off. On a notebook it opens from
 * the Routes button as a popover that stays open while the board is edited; on a phone, from the
 * ⋯ menu, as a sheet as tall as its rows.
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
  const shown = useShownRoutes((now) => now.shown);

  return (
    <RoutesShell onOpenChange={setOpen} open={open} phone={phone} trigger>
      <RouteRows onToggle={toggleRoute} shown={shown} />
    </RoutesShell>
  );
}
