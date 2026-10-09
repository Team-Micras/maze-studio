import { MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import { cn } from '@/ui/primitives/utils';

/** The props of {@link SearchField}. */
export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * The library's search (DESIGN.md 6 and 6.3): borderless inside its island, filled while focused,
 * with `/` to reach it from anywhere but a text field.
 */
export function SearchField({ value, onChange, className }: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !typingIn(event.target)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <label
      className={cn(
        'flex h-9 w-[260px] items-center gap-2 rounded-[10px] pr-2 pl-2.5 text-muted-foreground focus-within:bg-accent has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring max-[720px]:h-10 max-[720px]:w-auto max-[720px]:flex-1',
        className
      )}
    >
      <MagnifyingGlass aria-hidden size={16} />
      <span className="sr-only">Search mazes</span>
      <input
        autoComplete="off"
        name="q"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground max-[720px]:text-sm [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search mazes…"
        ref={input}
        spellCheck={false}
        type="search"
        value={value}
      />
      <kbd
        aria-hidden
        className="rounded-[5px] px-[5px] font-mono text-[11px] leading-4 text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] max-[720px]:hidden"
      >
        /
      </kbd>
    </label>
  );
}
