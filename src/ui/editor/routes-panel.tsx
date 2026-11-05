import { Path, X } from "@/ui/icons";
import { useId, useState, type ReactNode } from "react";

import type { Route, RouteSwitches, ShortestRoutes } from "@/maze";
import { ROUTE_COLORS, TRACK_COLORS } from "@/render";
import { insideCanvas } from "@/ui/canvas-id";
import { Hint, IslandButton } from "@/ui/islands/island";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/primitives/popover";
import { Sheet, SheetContent, SheetTitle } from "@/ui/primitives/sheet";
import { Switch } from "@/ui/primitives/switch";
import { cn } from "@/ui/primitives/utils";
import {
  anyRouteShown,
  toggleRoute,
  useShownRoutes,
} from "@/ui/route-switches";

/** The props of {@link Routes}. */
export interface RoutesProps {
  /** The routes of the maze on screen: `undefined` without a start or a goal, `null` out of reach. */
  readonly routes: ShortestRoutes | null | undefined;
  /** The side of a cell in metres. */
  readonly cellSize: number;
  /** Which routes the board draws. */
  readonly shown: RouteSwitches;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onToggle: (name: keyof ShortestRoutes) => void;
  readonly phone: boolean;
}

const ROWS = [
  {
    name: "withoutDiagonals",
    label: "Without diagonals",
    tile: "M7 26V9Q7 7 9 7H26",
  },
  { name: "withDiagonals", label: "With diagonals", tile: "M7 26V19L19 7H26" },
] as const;

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
}

/** A row per route, without diagonals then with them: its tile, its name and its switch. */
export function RouteRows({ shown, onToggle, details }: RouteRowsProps) {
  const id = useId();

  return (
    <div className="px-1 pb-2">
      <h3 className="mx-3 mt-1 mb-0.5 text-xs font-medium text-muted-foreground">
        Shortest
      </h3>
      {ROWS.map(({ name, label, tile }) => (
        <label
          className="grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-[10px] p-2 hover:bg-muted"
          data-route-row={name}
          htmlFor={`${id}-${name}`}
          key={name}
        >
          <svg
            aria-hidden
            className={cn(
              "size-8 rounded-[7px] shadow-island",
              !shown[name] && "opacity-45",
            )}
            style={{ background: TRACK_COLORS.floor }}
            viewBox="0 0 32 32"
          >
            <path
              d={tile}
              fill="none"
              stroke={ROUTE_COLORS[name]}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.6}
            />
          </svg>
          <span>
            <span className="block text-[13px] font-medium">{label}</span>
            {details === undefined ? null : (
              <span className="block text-xs text-muted-foreground">
                {details[name]}
              </span>
            )}
          </span>
          <Switch
            checked={shown[name]}
            id={`${id}-${name}`}
            onCheckedChange={() => onToggle(name)}
          />
        </label>
      ))}
    </div>
  );
}

function routeDetail(route: Route, cellSize: number): string {
  return `${route.cells} cells · ${(route.length * cellSize).toFixed(2)} m`;
}

function Body({
  routes,
  cellSize,
  shown,
  onToggle,
}: Omit<RoutesProps, "open" | "onOpenChange" | "phone">) {
  if (routes === undefined || routes === null) {
    return (
      <p
        className="px-4 pt-1 pb-4 text-[13px] text-muted-foreground"
        data-routes-empty=""
      >
        {routes === undefined
          ? "Routes need a start and a goal. Mark them with the Start and Goal tools."
          : "The goal can't be reached from the start. Open a wall to see the routes again."}
      </p>
    );
  }

  const twin = sameRoute(routes.withoutDiagonals, routes.withDiagonals);
  return (
    <RouteRows
      details={{
        withoutDiagonals: routeDetail(routes.withoutDiagonals, cellSize),
        withDiagonals: `${routeDetail(routes.withDiagonals, cellSize)}${twin ? " · same route as without diagonals" : ""}`,
      }}
      onToggle={onToggle}
      shown={shown}
    />
  );
}

function Head({
  heading,
  onClose,
}: {
  readonly heading: ReactNode;
  readonly onClose: () => void;
}) {
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
 * rows on a phone; its button shows active while either route is drawn.
 */
function RoutesShell({
  phone,
  open,
  onOpenChange,
  trigger,
  children,
}: RoutesShellProps) {
  const active = useShownRoutes((now) => anyRouteShown(now.shown));
  const close = (): void => onOpenChange(false);
  const button = trigger ? (
    <IslandButton
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Routes"
      className={cn(
        active &&
          "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
      )}
      data-active={active ? "" : undefined}
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
              heading={
                <SheetTitle className="flex-1 text-sm">Routes</SheetTitle>
              }
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
          heading={
            <h2 className="flex-1 text-sm leading-5 font-semibold">Routes</h2>
          }
          onClose={close}
        />
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Routes panel (DESIGN.md 6): the shortest route without diagonals and the one with them,
 * each with its cells, its length and a switch that shows it on the board; the routes stay on the
 * board after the panel closes, until their switches turn them off. On a notebook it opens from
 * the Routes button as a popover that stays open while the board is edited; on a phone, from the
 * ⋯ menu, as a sheet as tall as its rows.
 */
export function Routes({ phone, open, onOpenChange, ...body }: RoutesProps) {
  return (
    <RoutesShell
      onOpenChange={onOpenChange}
      open={open}
      phone={phone}
      trigger={!phone}
    >
      <Body {...body} />
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
