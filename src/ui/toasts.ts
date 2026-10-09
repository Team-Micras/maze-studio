/**
 * The app's toasts (DESIGN.md 6): one line of ink at the top centre, 2.4 s, announced politely.
 *
 * @module
 */

import { create } from 'zustand';

/** How long a toast stays, in milliseconds. */
export const TOAST_DURATION_MS = 2400;

/** A toast on screen. */
export interface Toast {
  readonly id: number;
  readonly text: string;
}

interface ToastState {
  readonly toasts: readonly Toast[];
  readonly next: number;
  readonly show: (text: string) => void;
  readonly dismiss: (id: number) => void;
}

/** The toasts on screen and how to add and remove them. */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  next: 1,
  show: (text) =>
    set((state) => ({ toasts: [...state.toasts, { id: state.next, text }], next: state.next + 1 })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Shows a toast. */
export function showToast(text: string): void {
  useToasts.getState().show(text);
}
