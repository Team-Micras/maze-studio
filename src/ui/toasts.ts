/**
 * The app's toasts (DESIGN.md 6): one line of ink at the top centre, 2.4 s, announced politely; a
 * toast may carry one action, which keeps it 8 s, and a persistent one stays until it is used or
 * closed.
 *
 * @module
 */

import { create } from 'zustand';

/** How long a toast stays, in milliseconds. */
export const TOAST_DURATION_MS = 2400;

/** How long a toast with an action stays, so there is time to reach its button. */
export const ACTION_TOAST_DURATION_MS = 8000;

/** What a toast's button does. */
export interface ToastAction {
  readonly label: string;
  /** What the button says to a screen reader: what the action is an alternative to. */
  readonly altText: string;
  readonly run: () => void;
}

/** A toast on screen. */
export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly action?: ToastAction;
  /** Whether it stays until its action or its close button is used. */
  readonly persistent?: boolean;
  /** The parts of `text` a page translator must leave alone: maze names, paths, file names. */
  readonly verbatim?: string | readonly string[];
}

/** What a toast is shown with, besides its text. */
export type ToastOptions = Pick<Toast, 'action' | 'persistent' | 'verbatim'>;

interface ToastState {
  readonly toasts: readonly Toast[];
  readonly next: number;
  readonly show: (text: string, options?: ToastOptions) => void;
  readonly dismiss: (id: number) => void;
}

/** The toasts on screen and how to add and remove them. */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  next: 1,
  show: (text, options = {}) =>
    set((state) => ({
      toasts: [...state.toasts, { id: state.next, text, ...options }],
      next: state.next + 1,
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Shows a toast. */
export function showToast(text: string, options?: ToastOptions): void {
  useToasts.getState().show(text, options);
}
