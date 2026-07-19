import { describe, expect, test } from 'vitest';
import { averageTimeForSolutions } from './calendarHistory';

describe('averageTimeForSolutions', () => {
  test('averages only positive durations and rounds to a whole second', () => {
    expect(averageTimeForSolutions([
      { seconds: 10 },
      { seconds: 0 },
      { seconds: -4 },
      { seconds: 15 },
    ])).toBe(13);
  });

  test('returns null without a timed solution', () => {
    expect(averageTimeForSolutions([])).toBeNull();
    expect(averageTimeForSolutions([{ seconds: 0 }])).toBeNull();
  });
});
