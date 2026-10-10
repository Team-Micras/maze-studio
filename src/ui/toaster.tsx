import { Toast } from 'radix-ui';

import { X } from './icons';
import { Verbatim } from './verbatim';
import {
  ACTION_TOAST_DURATION_MS,
  TOAST_DURATION_MS,
  useToasts,
  type Toast as ShownToast,
} from './toasts';

const BUTTON =
  'rounded-[8px] px-2 py-1 text-[13px] font-semibold text-primary-foreground outline-none hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground';

function durationOf(toast: ShownToast): number {
  if (toast.persistent === true) {
    return Number.POSITIVE_INFINITY;
  }

  return toast.action === undefined ? TOAST_DURATION_MS : ACTION_TOAST_DURATION_MS;
}

/**
 * The toasts, in one Radix viewport at the top centre, under the top islands (DESIGN.md 6): a toast
 * with an action shows its button, and a persistent one stays, with a close button, until used.
 */
export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <Toast.Provider duration={TOAST_DURATION_MS} swipeDirection="up">
      {toasts.map((toast) => (
        <Toast.Root
          className="flex items-center gap-2 rounded-[11px] bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-island data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1"
          data-persistent={toast.persistent === true ? '' : undefined}
          duration={durationOf(toast)}
          key={toast.id}
          onOpenChange={(open) => {
            if (!open) {
              dismiss(toast.id);
            }
          }}
        >
          <Toast.Title>
            <Verbatim text={toast.text} verbatim={toast.verbatim} />
          </Toast.Title>
          {toast.action === undefined ? null : (
            <Toast.Action
              altText={toast.action.altText}
              className={BUTTON}
              onClick={toast.action.run}
            >
              {toast.action.label}
            </Toast.Action>
          )}
          {toast.persistent === true ? (
            <Toast.Close aria-label="Close" className={BUTTON}>
              <X aria-hidden size={14} />
            </Toast.Close>
          ) : null}
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed top-safe-[72px] left-1/2 z-30 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring max-[720px]:top-safe-28" />
    </Toast.Provider>
  );
}
