import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';

import { showToast } from '@/ui/toasts';

import type { GenerateDialogProps } from './generate-dialog';

/** What the app says when the generator's chunk does not load. */
export const UNAVAILABLE = 'Could not load the generator. Reload to try again';

/**
 * What opens in place of the dialog when its chunk does not load: a toast saying so, at every
 * open, and the dialog closed at once.
 */
export function GeneratorUnavailable({ open, onOpenChange }: GenerateDialogProps) {
  useEffect(() => {
    if (open) {
      showToast(UNAVAILABLE);
      onOpenChange(false);
    }
  }, [open, onOpenChange]);

  return null;
}

/** The Generate dialog, with the generator and its worker, loaded the first time it opens. */
const GenerateDialog = lazy<ComponentType<GenerateDialogProps>>(() =>
  import('./generate-dialog').catch(() => ({ default: GeneratorUnavailable }))
);

/**
 * The Generate dialog in its own chunk: nothing is loaded until it first opens, and it stays
 * mounted after that.
 */
export function GenerateDialogLoader(props: GenerateDialogProps) {
  const [mounted, setMounted] = useState(false);

  if (props.open && !mounted) {
    setMounted(true);
  }

  return mounted ? (
    <Suspense fallback={null}>
      <GenerateDialog {...props} />
    </Suspense>
  ) : null;
}
