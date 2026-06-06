import { describe, expect, test } from 'vitest';
import { savedSolutionDateSet } from './savedSolutionDates';

describe('savedSolutionDateSet', () => {
  test('includes dates with at least one saved solution', () => {
    const dates = savedSolutionDateSet({
      '2026-06-04': [],
      '2026-06-05': [{ equation: '6=6' }],
      '2026-06-06': [{ equation: '6=6' }, { equation: '5+1=6' }],
    });

    expect([...dates].sort()).toEqual(['2026-06-05', '2026-06-06']);
  });
});
