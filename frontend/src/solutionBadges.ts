export type BadgeSolution = {
  equation: string;
  value: string;
};

export type BadgeSolutionsByDate<T extends BadgeSolution = BadgeSolution> = Record<string, readonly T[] | undefined>;

export type SolutionBadgeId = 'first-solution' | 'three-day-streak' | 'zero-equals-zero';

export type SolutionBadge = {
  id: SolutionBadgeId;
  title: string;
  description: string;
  earned: boolean;
};

const dayMs = 24 * 60 * 60 * 1000;

export function solutionBadges(solutionsByDate: BadgeSolutionsByDate): SolutionBadge[] {
  const solvedDates = Object.entries(solutionsByDate)
    .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
    .map(([dateIdentifier]) => dateIdentifier);

  const allSolutions = Object.values(solutionsByDate).flatMap((solutions) => solutions ?? []);

  return [
    {
      id: 'first-solution',
      title: 'First Solution',
      description: 'Save at least one correct solution.',
      earned: allSolutions.length > 0,
    },
    {
      id: 'three-day-streak',
      title: '3 Day Streak',
      description: 'Save solutions on three consecutive puzzle dates.',
      earned: hasThreeDayStreak(solvedDates),
    },
    {
      id: 'zero-equals-zero',
      title: '0 = 0',
      description: 'Save a solution where both sides equal zero.',
      earned: allSolutions.some((solution) => isZeroValue(solution.value)),
    },
  ];
}

function hasThreeDayStreak(dateIdentifiers: string[]): boolean {
  const days = [...new Set(dateIdentifiers.map(dayNumberFromIdentifier).filter((day) => day !== null))].sort(
    (left, right) => left - right,
  );
  let streak = 0;
  let previousDay: number | null = null;

  for (const day of days) {
    streak = previousDay === null || day !== previousDay + 1 ? 1 : streak + 1;
    if (streak >= 3) {
      return true;
    }
    previousDay = day;
  }

  return false;
}

function dayNumberFromIdentifier(dateIdentifier: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIdentifier);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / dayMs);
}

function isZeroValue(value: string): boolean {
  return /^[+-]?0(?:\.0+)?$/.test(value.trim());
}
