import { describe, expect, test } from 'vitest';
import { shouldSurfaceEvaluationError, type FeedbackToken } from './editorFeedback';

function tokens(values: string[]): FeedbackToken[] {
  return values.map((value) => ({ value }));
}

describe('shouldSurfaceEvaluationError', () => {
  test('suppresses temporary errors while an operand can still be typed', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', '÷']), 1, 'Equation could not be evaluated')).toBe(false);
    expect(shouldSurfaceEvaluationError(tokens(['5', '^']), 1, 'Equation could not be evaluated')).toBe(false);
    expect(shouldSurfaceEvaluationError(tokens(['√']), 0, 'Equation could not be evaluated')).toBe(false);
  });

  test('surfaces skipped operands once the user moves on', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', '÷', '=', '2']), 3, 'Equation could not be evaluated')).toBe(true);
    expect(shouldSurfaceEvaluationError(tokens(['5', '^', '+']), 3, 'Equation could not be evaluated')).toBe(true);
    expect(shouldSurfaceEvaluationError(tokens(['√', ')']), 3, 'Equation could not be evaluated')).toBe(true);
  });

  test('allows unary minus as the next operand', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', '÷', '-', '2']), 3, 'Equation could not be evaluated')).toBe(false);
  });

  test('surfaces unmatched closing parentheses immediately', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', ')']), 2, 'Equation could not be evaluated')).toBe(true);
  });

  test('surfaces invalid expressions after all digits are used', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', '÷']), null, 'Equation could not be evaluated')).toBe(true);
  });

  test('does not surface when there is no evaluator error', () => {
    expect(shouldSurfaceEvaluationError(tokens(['5', '÷', '=', '2']), 3, '')).toBe(false);
  });
});
