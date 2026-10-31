import { useEffect, useEffectEvent, useState } from 'react';

declare global {
  /** A close watcher, as far as the app and its tests use one. */
  interface CloseWatcher extends EventTarget {
    requestClose(): void;
    destroy(): void;
  }

  interface Window {
    /** Chromium's close watcher (Chrome 120+), which Android's back gesture and Escape close. */
    CloseWatcher?: new () => CloseWatcher;
  }
}

const MARKER = 'maze-studio:overlay';
const closers: (() => void)[] = [];
let leaving = false;

function onOverlayEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && MARKER in state;
}

function pushOverlayEntry(): void {
  window.history.pushState({ ...window.history.state, [MARKER]: true }, '');
}

function onPopState(): void {
  if (leaving) {
    leaving = false;
  } else {
    closers.pop()?.();
  }

  if (closers.length > 0) {
    pushOverlayEntry();
  }
}

function leaveOverlayEntry(): void {
  if (closers.length === 0 && onOverlayEntry()) {
    leaving = true;
    window.history.back();
  }
}

/**
 * Without a close watcher, the open overlays share one history entry at the same URL, so no route
 * changes: Back closes the innermost overlay and pushes the entry again while others stay open.
 */
function holdOverlayEntry(close: () => void): () => void {
  window.addEventListener('popstate', onPopState);

  if (closers.length === 0 && !onOverlayEntry()) {
    pushOverlayEntry();
  }

  closers.push(close);

  return () => {
    const index = closers.indexOf(close);

    if (index !== -1) {
      closers.splice(index, 1);
      queueMicrotask(leaveOverlayEntry);
    }
  };
}

/** The open state of an overlay's root, as Radix takes it. */
export interface OverlayOpen {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * Lets the system's Back close an overlay instead of leaving the app, one overlay per Back.
 * Takes the root's `open`, `defaultOpen` and `onOpenChange`, controlled or not, and returns the
 * controlled pair to pass on. While open, a `CloseWatcher` closes it where the browser has one;
 * elsewhere a history entry at the same URL does, removed again when the overlay closes otherwise.
 */
export function useCloseOnBack({ open, defaultOpen = false, onOpenChange }: OverlayOpen): {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const [own, setOwn] = useState(defaultOpen);
  const shown = open ?? own;
  const change = (next: boolean): void => {
    setOwn(next);
    onOpenChange?.(next);
  };
  const closeByBack = useEffectEvent(() => change(false));

  useEffect(() => {
    if (!shown) {
      return undefined;
    }

    const close = (): void => closeByBack();
    const Watcher = window.CloseWatcher;

    if (Watcher === undefined) {
      return holdOverlayEntry(close);
    }

    const watcher = new Watcher();
    watcher.addEventListener('close', close);
    return () => watcher.destroy();
  }, [shown]);

  return { open: shown, onOpenChange: change };
}
