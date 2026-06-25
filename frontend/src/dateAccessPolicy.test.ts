import { describe, expect, test } from 'vitest';
import {
  FUTURE_DATE_AD_DURATION_SECONDS,
  bannerPlacementForDate,
  dateAccessDecisionFor,
  dateAfterCancelingFutureGate,
  dateAfterDecliningFutureGate,
} from './dateAccessPolicy';

describe('dateAccessPolicy', () => {
  test('today opens clean before the first saved solution', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-25',
        today: '2026-06-25',
        unlockedFutureDates: new Set(),
      }),
    ).toEqual({ kind: 'open', showPastDateBanner: false });

    expect(bannerPlacementForDate({
      selectedDate: '2026-06-25',
      today: '2026-06-25',
      savedSolutionCount: 0,
    })).toBe('none');
  });

  test('current date shows a banner after one saved solution', () => {
    expect(bannerPlacementForDate({
      selectedDate: '2026-06-25',
      today: '2026-06-25',
      savedSolutionCount: 1,
    })).toBe('current_solution');
  });

  test('past dates open with a banner', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-24',
        today: '2026-06-25',
        unlockedFutureDates: new Set(),
      }),
    ).toEqual({ kind: 'open', showPastDateBanner: true });

    expect(bannerPlacementForDate({
      selectedDate: '2026-06-24',
      today: '2026-06-25',
      savedSolutionCount: 0,
    })).toBe('past');
  });

  test('locked future dates require the sponsor unlock', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-26',
        today: '2026-06-25',
        unlockedFutureDates: new Set(),
      }),
    ).toEqual({ kind: 'future_unlock', selectedDate: '2026-06-26' });
  });

  test('unlocked future dates open cleanly', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-26',
        today: '2026-06-25',
        unlockedFutureDates: new Set(['2026-06-26']),
      }),
    ).toEqual({ kind: 'open', showPastDateBanner: false });
  });

  test('future date unlock ads last thirty seconds', () => {
    expect(FUTURE_DATE_AD_DURATION_SECONDS).toBe(30);
  });

  test('declining or canceling the future gate returns to today', () => {
    expect(dateAfterDecliningFutureGate('2026-06-25')).toBe('2026-06-25');
    expect(dateAfterCancelingFutureGate('2026-06-25')).toBe('2026-06-25');
  });
});
