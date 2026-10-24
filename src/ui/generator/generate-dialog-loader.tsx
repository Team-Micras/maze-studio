import { lazy, Suspense, useState, type ComponentType } from 'react';

import { showToast } from '@/ui/toasts';

import type { GenerateDialogProps } from './generate-dialog';

function GeneratorUnavailable() {
  return null;
}

/** The Generate dialog, with the generator and its worker, loaded the first time it opens. */
const GenerateDialog = lazy<ComponentType<GenerateDialogProps>>(() =>
  import('./generate-dialog').catch(() => {
    showToast('Could not load the generator. Reload to try again');
    return { default: GeneratorUnavailable };
  })
);

/**
 * The Generate dialog in its own chunk: nothing is loaded until it first opens, and it stays
 * mounted after that, so its batch is still there the next time.
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
