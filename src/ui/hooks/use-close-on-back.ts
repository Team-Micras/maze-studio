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

/** The open state of an overlay's root, as Radix takes it. */
export interface OverlayOpen {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * Lets the system's Back close an overlay instead of leaving the app, one overlay per Back.
 * Takes the root's `open`, `defaultOpen` and `onOpenChange`, controlled or not, and returns the
 * controlled pair to pass on. While open, a `CloseWatcher` closes it where the browser has one
 * (Chrome 120+, which Android's installed app runs on); elsewhere Back is left alone.
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
    if (!shown || window.CloseWatcher === undefined) {
      return undefined;
    }

    const watcher = new window.CloseWatcher();
    watcher.addEventListener('close', () => closeByBack());
    return () => watcher.destroy();
  }, [shown]);

  return { open: shown, onOpenChange: change };
}
