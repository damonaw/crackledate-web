import { describe, expect, test } from 'vitest';
import {
  guidedPracticeSolution,
  guidedPracticeStepForTokens,
  guidedPracticeTotalSteps,
  type GuidedPracticeToken,
} from './guidedPractice';

function tokens(values: string[]): GuidedPracticeToken[] {
  return values.map((value, digitIndex) =>
    /^\d$/.test(value) ? { value, digitIndex } : { value },
  );
}

describe('guidedPractice', () => {
  test('guides the full practice solution one control at a time', () => {
    expect(guidedPracticeSolution).toBe('6+1+9=20÷2+6');
    expect(guidedPracticeTotalSteps).toBe(13);

    expect(guidedPracticeStepForTokens([])).toMatchObject({
      stepNumber: 1,
      totalSteps: 13,
      instruction: 'Step 1 of 13: tap the highlighted 6.',
      highlight: { kind: 'digit', value: 6, digitIndex: 0 },
    });

    expect(guidedPracticeStepForTokens(tokens(['6']))).toMatchObject({
      stepNumber: 2,
      instruction: 'Step 2 of 13: tap +.',
      highlight: { kind: 'operator', value: '+' },
    });

    expect(guidedPracticeStepForTokens(tokens(['6', '+', '1', '+', '9']))).toMatchObject({
      stepNumber: 6,
      instruction: 'Step 6 of 13: tap = to balance the equation.',
      highlight: { kind: 'operator', value: '=' },
    });

    expect(guidedPracticeStepForTokens(tokens(['6', '+', '1', '+', '9', '=', '2', '0']))).toMatchObject({
      stepNumber: 9,
      instruction: 'Step 9 of 13: tap ÷.',
      highlight: { kind: 'operator', value: '÷' },
    });

    expect(guidedPracticeStepForTokens(tokens(['6', '+', '1', '+', '9', '=', '2', '0', '÷', '2', '+', '6']))).toMatchObject({
      stepNumber: 13,
      instruction: 'Step 13 of 13: tap Submit to finish the practice round.',
      highlight: { kind: 'submit' },
    });
  });

  test('asks the player to clear when practice has drifted from the guided solution', () => {
    expect(guidedPracticeStepForTokens(tokens(['6', '-']))).toMatchObject({
      stepNumber: 1,
      totalSteps: 13,
      instruction: 'Tap Clear to restart the guided practice solution.',
      highlight: { kind: 'clear' },
    });
  });
});
