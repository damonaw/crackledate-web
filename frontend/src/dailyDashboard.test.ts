import { describe, expect, test } from 'vitest';
import {
  dailyDashboardSummaryFromSolutions,
  monthProgressText,
  solutionCountText,
  streakDescription,
  streakValue,
  successMessage,
} from './dailyDashboard';

describe('dailyDashboardSummaryFromSolutions', () => {
  test('builds the Android-aligned summary for a solved selected date', () => {
    const summary = dailyDashboardSummaryFromSolutions({
      dateIdentifier: '2026-06-19',
      displayDate: 'June 19, 2026',
      todayIdentifier: '2026-06-19',
      savedSolutions: {
        '2026-06-01': [{ equation: '1=1', seconds: 1, value: '1' }],
        '2026-06-17': [{ equation: '17=17', seconds: 1, value: '17' }],
        '2026-06-18': [{ equation: '18=18', seconds: 1, value: '18' }],
        '2026-06-19': [
          { equation: '6=6', seconds: 15, value: '6' },
          { equation: '6+1+9=20/2+6', seconds: 42, value: '16' },
        ],
      },
    });

    expect(summary).toEqual({
      dateIdentifier: '2026-06-19',
      displayDate: 'June 19, 2026',
      latestEquation: '6+1+9=20/2+6',
      latestValue: '16',
      latestSeconds: 42,
      solvedCountForDate: 2,
      streakCount: 3,
      monthSolvedCount: 4,
      monthAvailableCount: 19,
    });
  });

  test('returns null before the selected date has a saved solution', () => {
    expect(
      dailyDashboardSummaryFromSolutions({
        dateIdentifier: '2026-06-19',
        displayDate: 'June 19, 2026',
        todayIdentifier: '2026-06-19',
        savedSolutions: {
          '2026-06-18': [{ equation: '18=18', seconds: 1, value: '18' }],
          '2026-06-19': [],
        },
      }),
    ).toBeNull();
  });
});

describe('daily dashboard display copy', () => {
  test('matches Android success and stat copy', () => {
    expect(successMessage('16')).toBe('Solved. Both sides equal 16.');
    expect(successMessage('   ')).toBe('Solved. Both sides equal ?.');
    expect(streakValue(1)).toBe('1 day');
    expect(streakValue(3)).toBe('3 days');
    expect(streakValue(-2)).toBe('0 days');
    expect(streakDescription(3)).toBe('3 day streak ending on this date');
    expect(streakDescription(-2)).toBe('0 day streak ending on this date');
    expect(monthProgressText(4, 19)).toBe('4 of 19 days cracked this month');
    expect(monthProgressText(-1, -3)).toBe('0 of 0 days cracked this month');
    expect(solutionCountText(1)).toBe('1 saved solution');
    expect(solutionCountText(2)).toBe('2 saved solutions');
  });
});
