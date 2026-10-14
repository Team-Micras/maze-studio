import { FloppyDisk, LinkSimple } from '@/ui/icons';
import { Hint, IslandButton } from '@/ui/islands/island';

/** The props of {@link TitleActions}. */
export interface TitleActionsProps {
  /** Writes the copy back to its file in the folder, named; absent until the first edit. */
  readonly folderFile?: string;
  readonly onSaveToFolder?: () => void;
}

/**
 * The button of the title island (DESIGN.md 6.1): Save to folder for a folder maze once its first
 * edit has made the copy.
 */
export function TitleActions({ folderFile, onSaveToFolder }: TitleActionsProps) {
  return folderFile === undefined || onSaveToFolder === undefined ? null : (
    <Hint label={`Save to ${folderFile}`} side="bottom" verbatim={folderFile}>
      <IslandButton onClick={onSaveToFolder}>
        <FloppyDisk aria-hidden size={16} />
        Save to folder
      </IslandButton>
    </Hint>
  );
}

/** The props of {@link CopyLinkButton}. */
export interface CopyLinkButtonProps {
  readonly onCopy: () => void;
}

/** Copy link, in ink, at the end of the island at the top right on a notebook (DESIGN.md 9.2). */
export function CopyLinkButton({ onCopy }: CopyLinkButtonProps) {
  return (
    <Hint label="Copy link" side="bottom">
      <IslandButton aria-label="Copy link" onClick={onCopy} variant="default">
        <LinkSimple aria-hidden size={18} />
      </IslandButton>
    </Hint>
  );
}
