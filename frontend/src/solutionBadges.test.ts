import { describe, expect, test } from 'vitest';
import { solutionBadges } from './solutionBadges';

describe('solutionBadges', () => {
  test('earns first solution when any saved solution exists', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6=6', value: '6' }],
    });

    expect(badges.find((badge) => badge.id === 'first-solution')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === 'first-solution')?.earnedDate).toBe('2026-06-05');
    expect(badges.find((badge) => badge.id === 'first-solution')?.iconSrc).toBe('/badges/first-solve.png');
  });

  test('uses the first saved timestamp as the first solution earned date', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6=6', timestamp: '2026-06-07T02:20:00.000Z', value: '6' }],
    });

    expect(badges.find((badge) => badge.id === 'first-solution')?.earnedDate).toBe('2026-06-07');
  });

  test('earns three day streak for solutions on consecutive puzzle dates', () => {
    const badges = solutionBadges({
      '2026-05-31': [{ equation: '1=1', value: '1' }],
      '2026-06-01': [{ equation: '1=1', value: '1' }],
      '2026-06-02': [{ equation: '2=2', value: '2' }],
    });

    expect(badges.find((badge) => badge.id === 'three-day-streak')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === 'three-day-streak')?.earnedDate).toBe('2026-06-02');
    expect(badges.find((badge) => badge.id === 'three-day-streak')?.iconSrc).toBe('/badges/three-day-streak.png');
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
    expect(badges.find((badge) => badge.id === 'zero-equals-zero')?.iconSrc).toBe('/badges/zero-equals-zero.png');
  });

  test('earns multiplied by zero when a saved solution multiplies by zero', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6-6=0×5×2×0×2', value: '0' }],
    });

    expect(badges.find((badge) => badge.id === 'multiplied-by-zero')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === 'multiplied-by-zero')?.iconSrc).toBe(
      '/badges/multiplied-by-zero.png',
    );
  });

  test('earns double decker when a saved solution stacks division on one side', () => {
    const badges = solutionBadges({
      '2026-06-05': [{ equation: '6/6/2=3', value: '3' }],
    });

    expect(badges.find((badge) => badge.id === 'double-decker')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === 'double-decker')?.iconSrc).toBe('/badges/double-decker.png');
  });
});
