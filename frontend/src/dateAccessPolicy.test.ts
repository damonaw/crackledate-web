import { describe, expect, test } from 'vitest';
import { dateAccessDecisionFor } from './dateAccessPolicy';

describe('dateAccessPolicy', () => {
  test('today opens without ad banners even after saved solutions', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-25',
        today: '2026-06-25',
      }),
    ).toEqual({ kind: 'open' });
  });

  test('past dates open without ad banners', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-24',
        today: '2026-06-25',
      }),
    ).toEqual({ kind: 'open' });
  });

  test('future dates open without a sponsor unlock', () => {
    expect(
      dateAccessDecisionFor({
        selectedDate: '2026-06-26',
        today: '2026-06-25',
      }),
    ).toEqual({ kind: 'open' });
  });
});
