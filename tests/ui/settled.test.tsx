import { describe, expect, test } from 'vitest';

import { settled } from '@tests/support/ui/animations';

function running(): number {
  return document.getAnimations().filter((animation) => animation.playState === 'running').length;
}

describe('settled', () => {
  test('waits for an animation that starts a frame after the page looked still', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    let started = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        element.animate([{ opacity: 0 }, { opacity: 1 }], 300);
        started = true;
      })
    );

    await settled();

    expect(started).toBe(true);
    expect(running()).toBe(0);
    expect(element.getAnimations()).toHaveLength(0);
    element.remove();
  });
});
