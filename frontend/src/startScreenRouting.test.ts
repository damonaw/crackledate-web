import { describe, expect, test } from 'vitest';
import { initialActiveView } from './startScreenRouting';

describe('web start screen routing', () => {
  test('clean storage starts on the shared start surface before guided first win', () => {
    expect(initialActiveView({ playStarted: false, guidedFirstWinCompleted: false })).toBe('start');
  });

  test('returning players skip the shared start surface', () => {
    expect(initialActiveView({ playStarted: true, guidedFirstWinCompleted: false })).toBe('game');
    expect(initialActiveView({ playStarted: false, guidedFirstWinCompleted: true })).toBe('game');
  });
});
