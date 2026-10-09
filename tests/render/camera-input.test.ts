import { describe, expect, test } from 'vitest';

import { wheelIntent, zoomKey, type WheelInput } from '@/render';

const VIEWPORT = { width: 1440, height: 900 };

function wheel(input: Partial<WheelInput>): WheelInput {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    buttons: 0,
    ...input,
  };
}

describe('The wheel without Ctrl or Cmd', () => {
  test('pans against the scroll, by pixels', () => {
    expect(wheelIntent(wheel({ deltaX: 12, deltaY: 30 }), VIEWPORT)).toEqual({
      kind: 'pan',
      dx: -12,
      dy: -30,
    });
  });

  test('turns lines into 16 pixels and pages into the viewport size', () => {
    expect(wheelIntent(wheel({ deltaX: 1, deltaY: 3, deltaMode: 1 }), VIEWPORT)).toEqual({
      kind: 'pan',
      dx: -16,
      dy: -48,
    });
    expect(wheelIntent(wheel({ deltaX: 0.5, deltaY: 1, deltaMode: 2 }), VIEWPORT)).toEqual({
      kind: 'pan',
      dx: -720,
      dy: -900,
    });
  });

  test('with Shift adds deltaY to deltaX on the horizontal axis', () => {
    expect(wheelIntent(wheel({ deltaX: 5, deltaY: 40, shiftKey: true }), VIEWPORT)).toEqual({
      kind: 'pan',
      dx: -45,
      dy: 0,
    });
    expect(wheelIntent(wheel({ deltaY: 2, deltaMode: 1, shiftKey: true }), VIEWPORT)).toEqual({
      kind: 'pan',
      dx: -32,
      dy: 0,
    });
  });
});

describe('The wheel with Ctrl or Cmd', () => {
  test('zooms by exp(-deltaY × 0.01) for a trackpad, pixel deltas under 50', () => {
    expect(wheelIntent(wheel({ deltaY: -10, ctrlKey: true }), VIEWPORT)).toEqual({
      kind: 'zoom',
      factor: Math.exp(0.1),
    });
    expect(wheelIntent(wheel({ deltaY: 49, metaKey: true }), VIEWPORT)).toEqual({
      kind: 'zoom',
      factor: Math.exp(-0.49),
    });
  });

  test('zooms by exp(-deltaY × 0.0025) for a mouse wheel, after lines become pixels', () => {
    expect(wheelIntent(wheel({ deltaY: 100, ctrlKey: true }), VIEWPORT)).toEqual({
      kind: 'zoom',
      factor: Math.exp(-0.25),
    });
    expect(wheelIntent(wheel({ deltaY: -50, ctrlKey: true }), VIEWPORT)).toEqual({
      kind: 'zoom',
      factor: Math.exp(0.125),
    });
    expect(wheelIntent(wheel({ deltaY: 3, deltaMode: 1, ctrlKey: true }), VIEWPORT)).toEqual({
      kind: 'zoom',
      factor: Math.exp(-48 * 0.0025),
    });
  });
});

describe('The wheel while the primary button is down', () => {
  test('is ignored, pan and zoom alike', () => {
    expect(wheelIntent(wheel({ deltaY: 30, buttons: 1 }), VIEWPORT)).toBeUndefined();
    expect(wheelIntent(wheel({ deltaY: 30, ctrlKey: true, buttons: 3 }), VIEWPORT)).toBeUndefined();
    expect(wheelIntent(wheel({ deltaY: 30, buttons: 4 }), VIEWPORT)?.kind).toBe('pan');
  });
});

describe('zoomKey', () => {
  test('reads + and = as in, - as out and 0 as fit, and nothing else', () => {
    expect(['+', '=', '-', '0', 'z', 'Minus', '1'].map(zoomKey)).toEqual([
      'in',
      'in',
      'out',
      'fit',
      undefined,
      undefined,
      undefined,
    ]);
  });
});
