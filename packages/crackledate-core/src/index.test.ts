import { describe, expect, test } from 'vitest';
import {
  deleteAtSelection,
  firstUnusedDigitIndex,
  insertTokensAtSelection,
  moveSelectionHorizontally,
  nextAbsoluteDelimiterRole,
  puzzleForDate,
  runningValues,
  savedSolutionDateSet,
  solutionBadges,
  validateEquation,
  type EditableEquationToken,
} from './index';

describe('puzzle dates', () => {
  test('uses local date digits in order', () => {
    const puzzle = puzzleForDate(new Date(2026, 4, 16, 12));

    expect(puzzle).toEqual({
      dateIdentifier: '2026-05-16',
      displayDate: 'May 16, 2026',
      formattedDate: '5-16-2026',
      digits: [5, 1, 6, 2, 0, 2, 6],
      delimiterPositions: [0, 2],
    });
  });
});

describe('equation validation parity', () => {
  test('accepts a known May sixteenth solution', () => {
    const response = validateEquation('5+√16=2^0+2+6', [5, 1, 6, 2, 0, 2, 6]);

    expect(response).toEqual({ valid: true, leftValue: '9', rightValue: '9' });
  });

  test('rejects out-of-order digits', () => {
    expect(validateEquation('5+√61=2^0+2+6', [5, 1, 6, 2, 0, 2, 6])).toEqual({
      valid: false,
      errorMessage: 'Digits must be used in date order',
    });
  });

  test('reports unequal sides with evaluated values', () => {
    expect(validateEquation('5+1+6=2+0+2+6', [5, 1, 6, 2, 0, 2, 6])).toEqual({
      valid: false,
      leftValue: '12',
      rightValue: '10',
      errorMessage: 'Left side (12) does not equal right side (10)',
    });
  });

  test('uses exact rational equality and repeating display', () => {
    expect(validateEquation('1/3+1/3=2/3', [1, 3, 1, 3, 2, 3])).toEqual({
      valid: true,
      leftValue: '0.6\u0305',
      rightValue: '0.6\u0305',
    });
  });

  test('accepts large finite powers', () => {
    expect(validateEquation('5^24=5^24', [5, 2, 4, 5, 2, 4])).toEqual({
      valid: true,
      leftValue: '59604644775390625',
      rightValue: '59604644775390625',
    });
  });
});

describe('running value parity', () => {
  test('evaluates partial sides', () => {
    expect(runningValues('5+√16=')).toEqual({ left: '9', right: '?' });
  });

  test('formats repeating decimals with combining overline', () => {
    expect(runningValues('516/202=')).toEqual({ left: '2.5\u03055\u03054\u03054\u0305', right: '?' });
  });

  test('keeps non-repeating decimal prefix', () => {
    expect(runningValues('1/6=')).toEqual({ left: '0.16\u0305', right: '?' });
  });

  test('keeps terminating decimals plain', () => {
    expect(runningValues('1/8=')).toEqual({ left: '0.125', right: '?' });
  });

  test('evaluates absolute values and implicit multiplication', () => {
    expect(runningValues('5|1|=')).toEqual({ left: '5', right: '?' });
  });

  test('rejects extremely large exponents', () => {
    expect(runningValues('51^3^20=')).toEqual({
      left: '?',
      right: '?',
      errorMessage: 'Calculated number is too large',
    });
  });
});

describe('editor helpers', () => {
  test('inserts and deletes paired absolute values at selection', () => {
    const tokens: EditableEquationToken[] = [
      { value: '|', role: 'absoluteOpen' },
      { value: '|', role: 'absoluteClose' },
      { value: '2' },
    ];

    expect(deleteAtSelection(tokens, { kind: 'token', index: 0 })).toEqual({
      tokens: [{ value: '2' }],
      selection: { kind: 'slot', index: 0 },
    });
  });

  test('moves selection horizontally through tokens and slots', () => {
    expect(moveSelectionHorizontally(2, { kind: 'slot', index: 0 }, 1)).toEqual({ kind: 'token', index: 0 });
    expect(moveSelectionHorizontally(2, { kind: 'slot', index: 0 }, -1)).toEqual({ kind: 'slot', index: 2 });
  });

  test('chooses the next absolute delimiter role', () => {
    expect(nextAbsoluteDelimiterRole([{ value: '|', role: 'absoluteOpen' }, { value: '2' }], {
      kind: 'slot',
      index: 2,
    })).toBe('absoluteClose');
  });

  test('tracks first unused date digit index', () => {
    const result = insertTokensAtSelection([], { kind: 'slot', index: 0 }, [
      { value: '5', digitIndex: 0 },
      { value: '+', digitIndex: undefined },
    ]);

    expect(firstUnusedDigitIndex(result.tokens, [5, 1, 6])).toBe(1);
  });
});

describe('solution helpers', () => {
  test('collects saved solution dates', () => {
    expect([...savedSolutionDateSet({ '2026-05-16': [{ equation: 'x' }], '2026-05-17': [] })]).toEqual([
      '2026-05-16',
    ]);
  });

  test('computes earned badges', () => {
    const badges = solutionBadges({
      '2026-05-16': [{ equation: '5*0=0', value: '0', timestamp: '2026-05-16T12:00:00Z' }],
      '2026-05-17': [{ equation: '1/1=1', value: '1', timestamp: '2026-05-17T12:00:00Z' }],
      '2026-05-18': [{ equation: '1/2/3=1/6', value: '0.16\u0305', timestamp: '2026-05-18T12:00:00Z' }],
    });

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toEqual({
      'first-solution': true,
      'three-day-streak': true,
      'zero-equals-zero': true,
      'multiplied-by-zero': true,
      'double-decker': true,
    });
  });
});
