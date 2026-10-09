import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether `target` has come into the view of `root`, the nearest scrolling list; once it has, it
 * stays so, since what it gated has been drawn.
 */
export function useInView(target: RefObject<Element | null>, root: Element | null): boolean {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = target.current;

    if (seen || element === null || root === null) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
        }
      },
      { root }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, root, seen]);

  return seen;
}
