import { describe, expect, test } from 'vitest';
import { practiceCompletionTarget } from './practiceCompletion';

describe('practiceCompletionTarget', () => {
  test('sends the player to the current daily puzzle after a solved practice round', () => {
    expect(practiceCompletionTarget('2026-06-25')).toEqual({
      activeView: 'game',
      selectedDate: '2026-06-25',
    });
  });
});
