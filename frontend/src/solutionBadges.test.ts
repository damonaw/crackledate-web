import { describe, expect, test } from 'vitest';
import { solutionBadges } from './solutionBadges';

describe('solutionBadges', () => {
  test('earns first solution when any saved solution exists', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6=6', value: '6' }],
    });

    expect(badges.find((badge) => badge.id === 'first-solution')?.earned).toBe(true);
  });

  test('earns three day streak for solutions on consecutive puzzle dates', () => {
    const badges = solutionBadges({
      '2026-05-31': [{ equation: '1=1', value: '1' }],
      '2026-06-01': [{ equation: '1=1', value: '1' }],
      '2026-06-02': [{ equation: '2=2', value: '2' }],
    });

    expect(badges.find((badge) => badge.id === 'three-day-streak')?.earned).toBe(true);
  });

  test('does not earn three day streak when a date is skipped', () => {
    const badges = solutionBadges({
      '2026-06-01': [{ equation: '1=1', value: '1' }],
      '2026-06-03': [{ equation: '3=3', value: '3' }],
      '2026-06-04': [{ equation: '4=4', value: '4' }],
    });

    expect(badges.find((badge) => badge.id === 'three-day-streak')?.earned).toBe(false);
  });

  test('earns zero equals zero when a saved solution value is zero', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6-6=0×5×2×0×2', value: '0' }],
    });

    expect(badges.find((badge) => badge.id === 'zero-equals-zero')?.earned).toBe(true);
  });
});
