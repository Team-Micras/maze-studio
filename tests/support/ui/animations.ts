/**
 * Waiting for the page to stop moving, for tests that measure or click what an animation places.
 *
 * @module
 */

/** How many frames {@link settled} waits for the page to stop, about two seconds at 60 Hz. */
const MAX_FRAMES = 120;

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function moving(): Animation[] {
  return document
    .getAnimations()
    .filter(
      (animation) =>
        animation.effect?.getComputedTiming().iterations !== Infinity &&
        (animation.pending || animation.playState === 'running')
    );
}

/**
 * Resolves once two frames in a row start with no finite animation running or about to, waiting
 * for those that are; an island mounted late fades in after the first quiet frame, and the second
 * one sees it.
 *
 * @throws {Error} When the page still moves after {@link MAX_FRAMES} frames.
 */
export function settled(): Promise<void> {
  return settledFrom(0, 0);
}

async function settledFrom(frame: number, quiet: number): Promise<void> {
  if (quiet === 2) {
    return;
  }

  if (frame === MAX_FRAMES) {
    throw new Error('the page did not stop moving');
  }

  await nextFrame();
  const running = moving();
  await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  await settledFrom(frame + 1, running.length === 0 ? quiet + 1 : 0);
}
