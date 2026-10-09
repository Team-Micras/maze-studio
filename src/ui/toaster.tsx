import { Toast } from 'radix-ui';

import { TOAST_DURATION_MS, useToasts } from './toasts';

/** The toasts, in one Radix viewport at the top centre, under the top islands. */
export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <Toast.Provider duration={TOAST_DURATION_MS} swipeDirection="up">
      {toasts.map((toast) => (
        <Toast.Root
          className="rounded-[11px] bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-island data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1"
          key={toast.id}
          onOpenChange={(open) => {
            if (!open) {
              dismiss(toast.id);
            }
          }}
        >
          <Toast.Title>{toast.text}</Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed top-[72px] left-1/2 z-30 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 outline-none max-[720px]:top-[112px]" />
    </Toast.Provider>
  );
}
