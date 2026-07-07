import { describe, expect, test } from 'vitest';
import { nextVisibleHintStep } from './hintFlow';

const classicHint = {
  solution: '6+2+5=|2^0|+2*6',
  step1: '13',
  step2: '6+2+5',
  step3: '6+2+5=|2^0|+2*6',
};

describe('hintFlow', () => {
  test('does not jump directly to the full solution on the first hint request', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 1,
        currentHintStep: 0,
        equation: '6+2+5',
        gameMode: 'classic',
        isEasyMode: true,
        evaluatedLeft: '13',
        data: classicHint,
      }),
    ).toBe(1);
  });

  test('shows the second hint before the full solution even when the entered equation matches it', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 2,
        currentHintStep: 1,
        equation: '6+2+5',
        gameMode: 'classic',
        isEasyMode: true,
        evaluatedLeft: '13',
        data: classicHint,
      }),
    ).toBe(2);
  });

  test('allows the full solution after two visible hints', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 3,
        currentHintStep: 2,
        equation: '6+2+5',
        gameMode: 'classic',
        isEasyMode: true,
        evaluatedLeft: '13',
        data: classicHint,
      }),
    ).toBe(3);
  });

});
