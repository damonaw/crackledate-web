import { describe, expect, test } from 'vitest';
import {
  dailyShareSummaryFromSolutions,
  savedSolutionSharePayload,
  spoilerFreeDailySharePayload,
} from './sharePayloads';

describe('sharePayloads', () => {
  test('formats spoiler-free daily shares with progress and no equation', () => {
    const payload = spoilerFreeDailySharePayload({
      displayDate: 'June 19, 2026',
      latestEquation: '6+1+9=20/2+6',
      latestValue: '16',
      streakCount: 3,
      monthSolvedCount: 4,
      monthAvailableCount: 19,
    });

    expect(payload).toContain('Crackle Date - June 19, 2026');
    expect(payload).toContain('Cracked with value 16');
    expect(payload).toContain('Streak: 3 days');
    expect(payload).toContain('Month: 4 of 19 days cracked this month');
    expect(payload).toContain('No spoilers.');
    expect(payload).not.toContain('6+1+9=20/2+6');
  });

  test('builds daily share summary from saved solutions for the selected date', () => {
    const summary = dailyShareSummaryFromSolutions({
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
      displayDate: 'June 19, 2026',
      latestEquation: '6+1+9=20/2+6',
      latestValue: '16',
      streakCount: 3,
      monthSolvedCount: 4,
      monthAvailableCount: 19,
    });
  });

  test('does not build a daily share summary before the date has a solution', () => {
    expect(
      dailyShareSummaryFromSolutions({
        dateIdentifier: '2026-06-19',
        displayDate: 'June 19, 2026',
        todayIdentifier: '2026-06-19',
        savedSolutions: {},
      }),
    ).toBeNull();
  });

  test('formats saved solution shares with equation, value, and solve time', () => {
    expect(
      savedSolutionSharePayload('June 19, 2026', {
        equation: '6+1+9=20/2+6',
        seconds: 42,
        value: '16',
      }),
    ).toBe(
      [
        'Crackle Date - June 19, 2026',
        '6+1+9=20/2+6',
        'Value: 16',
        'Time: 42s',
      ].join('\n'),
    );
  });

  test('uses unknown markers for blank share values', () => {
    expect(
      spoilerFreeDailySharePayload({
        displayDate: 'June 19, 2026',
        latestEquation: '6=6',
        latestValue: '   ',
        streakCount: 1,
        monthSolvedCount: 1,
        monthAvailableCount: 19,
      }),
    ).toContain('Cracked with value ?');

    expect(
      savedSolutionSharePayload('June 19, 2026', {
        equation: '',
        seconds: 0,
        value: ' ',
      }),
    ).toContain('Equation unavailable\nValue: ?\nTime: Saved');
  });
});
