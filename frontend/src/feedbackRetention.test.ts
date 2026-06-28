import { describe, expect, test } from 'vitest';
import { feedbackMessageAfterPuzzleLoad } from './feedbackRetention';

describe('feedbackMessageAfterPuzzleLoad', () => {
  test('clears ordinary feedback after a puzzle date load', () => {
    expect(feedbackMessageAfterPuzzleLoad('Could not load the puzzle date.', false)).toBe('');
  });

  test('keeps practice completion feedback when returning to the daily puzzle', () => {
    expect(feedbackMessageAfterPuzzleLoad('Practice solved. Both sides equal 16.', true)).toBe(
      'Practice solved. Both sides equal 16.',
    );
  });
});
