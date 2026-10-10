import { FolderOpen } from '@/ui/icons';
import { useRef } from 'react';

import { Hint, IslandButton } from '@/ui/islands/island';

import { pickedFile } from './picked-file';

/** The props of {@link OpenFileButton}. */
export interface OpenFileButtonProps {
  readonly onFile: (file: File) => void;
}

/** The library's Open button: picks a mazefiles `.txt` file (DESIGN.md 6.1). */
export function OpenFileButton({ onFile }: OpenFileButtonProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Hint label="Open a .txt file" side="bottom">
        <IslandButton onClick={() => input.current?.click()}>
          <FolderOpen aria-hidden size={18} />
          Open
        </IslandButton>
      </Hint>
      <input
        accept=".txt,text/plain"
        aria-hidden
        className="hidden"
        data-open-file=""
        onChange={(event) => pickedFile(event, onFile)}
        ref={input}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}
