import type { SolutionBadge, SolutionBadgeId } from './solutionBadges';

export type NextBadgeTarget = {
  badgeId: SolutionBadgeId;
  title: string;
  description: string;
  actionText: string;
};

export function nextBadgeTargetFromBadges(badges: readonly SolutionBadge[]): NextBadgeTarget | null {
  const badge = badges.find((candidate) => !candidate.earned);
  if (!badge) return null;
  return {
    badgeId: badge.id,
    title: badge.title,
    description: badge.description,
    actionText: actionTextFor(badge.id),
  };
}

function actionTextFor(id: SolutionBadgeId): string {
  switch (id) {
    case 'first-solution':
      return 'Save any correct equation.';
    case 'three-day-streak':
      return 'Crack three consecutive dates.';
    case 'zero-equals-zero':
      return 'Make both sides equal zero.';
    case 'multiplied-by-zero':
      return 'Use multiplication by zero.';
    case 'double-decker':
      return 'Stack division on one side.';
  }
}
