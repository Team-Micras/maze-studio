import type { ChangeEvent } from 'react';

/** Hands on the file picked in a file input and clears it, so the same file can be picked again. */
export function pickedFile(event: ChangeEvent<HTMLInputElement>, onFile: (file: File) => void) {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (file !== undefined) {
    onFile(file);
  }
}
