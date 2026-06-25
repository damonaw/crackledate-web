import { describe, expect, test } from 'vitest';
import { practiceRound, practiceSuccessMessage } from './practiceRound';

describe('practiceRound', () => {
  test('uses the Android practice date and copy', () => {
    expect(practiceRound.dateIdentifier).toBe('2026-06-19');
    expect(practiceRound.formattedDate).toBe('6-19-2026');
    expect(practiceRound.digits).toEqual([6, 1, 9, 2, 0, 2, 6]);
    expect(practiceRound.title).toBe('Practice Round');
    expect(practiceRound.coach).toContain('does not affect');
    expect(practiceRound.coach).toContain('saved solutions');
  });

  test('formats practice success messages without saving progress language', () => {
    expect(practiceSuccessMessage('16')).toBe('Practice solved. Both sides equal 16.');
    expect(practiceSuccessMessage(' 16 ')).toBe('Practice solved. Both sides equal 16.');
    expect(practiceSuccessMessage(' ')).toBe('Practice solved. Both sides equal ?.');
  });
});
