import { describe, expect, test } from 'vitest';
import { nextBadgeTargetFromBadges } from './nextBadgeTargets';
import type { SolutionBadge } from './solutionBadges';

describe('nextBadgeTargetFromBadges', () => {
  test('returns the first unearned badge as the next target', () => {
    const target = nextBadgeTargetFromBadges([
      badge('first-solution', false, 'First Solution'),
      badge('three-day-streak', false, 'Three Day Streak'),
    ]);

    expect(target).toEqual({
      badgeId: 'first-solution',
      title: 'First Solution',
      description: 'Save at least one correct solution.',
      actionText: 'Save any correct equation.',
    });
  });

  test('skips earned badges', () => {
    const target = nextBadgeTargetFromBadges([
      badge('first-solution', true, 'First Solution'),
      badge('three-day-streak', false, 'Three Day Streak'),
    ]);

    expect(target?.badgeId).toBe('three-day-streak');
    expect(target?.actionText).toBe('Crack three consecutive dates.');
  });

  test('returns null when every badge is earned', () => {
    expect(nextBadgeTargetFromBadges([
      badge('first-solution', true),
      badge('three-day-streak', true),
    ])).toBeNull();
  });

  test('uses Android action copy for every badge target', () => {
    const actionTextByBadge = {
      'first-solution': 'Save any correct equation.',
      'three-day-streak': 'Crack three consecutive dates.',
      'zero-equals-zero': 'Make both sides equal zero.',
      'multiplied-by-zero': 'Use multiplication by zero.',
      'double-decker': 'Stack division on one side.',
    } as const;

    for (const [badgeId, actionText] of Object.entries(actionTextByBadge)) {
      const target = nextBadgeTargetFromBadges([badge(badgeId as SolutionBadge['id'], false)]);
      expect(target?.actionText).toBe(actionText);
    }
  });
});

function badge(id: SolutionBadge['id'], earned: boolean, title = id): SolutionBadge {
  return {
    id,
    title,
    description: 'Save at least one correct solution.',
    earned,
  };
}
