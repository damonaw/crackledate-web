import { describe, expect, test } from 'vitest';
import {
  persistSavedSolutions,
  savedSolutionDateSet,
  type SavedSolutionsStorage,
} from './savedSolutionDates';

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

describe('persistSavedSolutions', () => {
  const solutions = {
    '2026-07-12': [{ equation: '6+1+9=20÷2+6', seconds: 12 }],
  };

  test('writes the exact versioned key and verifies the serialized value', () => {
    const values = new Map<string, string>();
    const storage: SavedSolutionsStorage = {
      setItem: (key, value) => values.set(key, value),
      getItem: (key) => values.get(key) ?? null,
    };

    expect(persistSavedSolutions(solutions, storage)).toBe(true);
    expect(values.get('crackledate.web.solutions.v1')).toBe(JSON.stringify(solutions));
  });

  test.each(['SecurityError', 'QuotaExceededError'])(
    'returns false when storage throws %s',
    (errorName) => {
      const storage: SavedSolutionsStorage = {
        setItem: () => {
          throw new DOMException('Blocked', errorName);
        },
        getItem: () => null,
      };

      expect(persistSavedSolutions(solutions, storage)).toBe(false);
    },
  );

  test('returns false when storage read-back does not match', () => {
    const storage: SavedSolutionsStorage = {
      setItem: () => undefined,
      getItem: () => '{"different":true}',
    };

    expect(persistSavedSolutions(solutions, storage)).toBe(false);
  });

  test('returns false when storage silently drops the written value', () => {
    const storage: SavedSolutionsStorage = {
      setItem: () => undefined,
      getItem: () => null,
    };

    expect(persistSavedSolutions(solutions, storage)).toBe(false);
  });
});
