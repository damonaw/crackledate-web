import { describe, expect, test } from 'vitest';
import { nextVisibleHintStep } from './hintFlow';

describe('hintFlow', () => {
  test('does not jump directly to the full solution on the first hint request', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 1,
        currentHintStep: 0,
      }),
    ).toBe(1);
  });

  test('shows the second hint before the full solution even when the entered equation matches it', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 2,
        currentHintStep: 1,
      }),
    ).toBe(2);
  });

  test('allows the full solution after two visible hints', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 3,
        currentHintStep: 2,
      }),
    ).toBe(3);
  });
});
