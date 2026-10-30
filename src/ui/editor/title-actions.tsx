import { LinkSimple } from '@/ui/icons';
import { Hint, IslandButton } from '@/ui/islands/island';

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
