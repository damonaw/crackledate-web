export type BadgeSolution = {
  equation: string;
  timestamp?: string;
  value: string;
};

export type BadgeSolutionsByDate<T extends BadgeSolution = BadgeSolution> = Record<string, readonly T[] | undefined>;

export type SolutionBadgeId =
  | 'first-solution'
  | 'three-day-streak'
  | 'zero-equals-zero'
  | 'multiplied-by-zero'
  | 'double-decker';

export type SolutionBadge = {
  id: SolutionBadgeId;
  title: string;
  description: string;
  earnedDate?: string;
  iconSrc?: string;
  earned: boolean;
};

const dayMs = 24 * 60 * 60 * 1000;

export function solutionBadges(solutionsByDate: BadgeSolutionsByDate): SolutionBadge[] {
  const solvedDates = Object.entries(solutionsByDate)
    .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
    .map(([dateIdentifier]) => dateIdentifier);

  const allSolutions = Object.entries(solutionsByDate).flatMap(([dateIdentifier, solutions]) =>
    (solutions ?? []).map((solution) => ({ ...solution, dateIdentifier })),
  );
  const firstSolution = earliestSolution(allSolutions);
  const threeDayStreakDate = firstThreeDayStreakEarnedDate(solvedDates);
  const firstZeroSolution = earliestSolution(allSolutions.filter((solution) => isZeroValue(solution.value)));
  const firstZeroMultiplication = earliestSolution(
    allSolutions.filter((solution) => hasMultiplicationByZero(solution.equation)),
  );
  const firstDoubleDecker = earliestSolution(allSolutions.filter((solution) => hasStackedDivision(solution.equation)));

  return [
    {
      id: 'first-solution',
      title: 'First Solution',
      description: 'Save at least one correct solution.',
      earnedDate: firstSolution?.earnedDate,
      iconSrc: '/badges/first-solve.png',
      earned: firstSolution !== undefined,
    },
    {
      id: 'three-day-streak',
      title: 'Three Day Streak',
      description: 'Save solutions on three consecutive puzzle dates.',
      earnedDate: threeDayStreakDate,
      iconSrc: '/badges/three-day-streak.png',
      earned: threeDayStreakDate !== undefined,
    },
    {
      id: 'zero-equals-zero',
      title: 'Zero = Zero',
      description: 'Save a solution where both sides equal zero.',
      earnedDate: firstZeroSolution?.earnedDate,
      iconSrc: '/badges/zero-equals-zero.png',
      earned: firstZeroSolution !== undefined,
    },
    {
      id: 'multiplied-by-zero',
      title: 'Multiplied by Zero',
      description: 'Use multiplication by zero in a saved solution.',
      earnedDate: firstZeroMultiplication?.earnedDate,
      iconSrc: '/badges/multiplied-by-zero.png',
      earned: firstZeroMultiplication !== undefined,
    },
    {
      id: 'double-decker',
      title: 'Double Decker',
      description: 'Stack division on top of division in a saved solution.',
      earnedDate: firstDoubleDecker?.earnedDate,
      iconSrc: '/badges/double-decker.png',
      earned: firstDoubleDecker !== undefined,
    },
  ];
}

function firstThreeDayStreakEarnedDate(dateIdentifiers: string[]): string | undefined {
  const days = [...new Set(dateIdentifiers.map(dayNumberFromIdentifier).filter((day) => day !== null))].sort(
    (left, right) => left - right,
  );
  let streak = 0;
  let previousDay: number | null = null;

  for (const day of days) {
    streak = previousDay === null || day !== previousDay + 1 ? 1 : streak + 1;
    if (streak >= 3) {
      return dateIdentifierFromDayNumber(day);
    }
    previousDay = day;
  }

  return undefined;
}

function earliestSolution<T extends BadgeSolution & { dateIdentifier: string }>(
  solutions: T[],
): { earnedDate: string; sortTime: number } | undefined {
  return solutions
    .map((solution) => {
      const timestampDate = dateIdentifierFromTimestamp(solution.timestamp);
      const earnedDate = timestampDate ?? solution.dateIdentifier;
      return {
        earnedDate,
        sortTime: timestampDate
          ? Date.parse(solution.timestamp ?? '')
          : (dayNumberFromIdentifier(solution.dateIdentifier) ?? 0) * dayMs,
      };
    })
    .sort((left, right) => left.sortTime - right.sortTime)[0];
}

function dayNumberFromIdentifier(dateIdentifier: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIdentifier);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / dayMs);
}

function dateIdentifierFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * dayMs).toISOString().slice(0, 10);
}

function dateIdentifierFromTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
}

function isZeroValue(value: string): boolean {
  return /^[+-]?0(?:\.0+)?$/.test(value.trim());
}

function hasMultiplicationByZero(equation: string): boolean {
  return tokenizeEquation(equation).some((token, index, tokens) => {
    if (token !== '*') return false;
    return tokens[index - 1] === '0' || tokens[index + 1] === '0';
  });
}

function hasStackedDivision(equation: string): boolean {
  const sides = equation.split('=');
  return sides.some((side) => tokenizeEquation(side).filter((token) => token === '/').length >= 2);
}

function tokenizeEquation(equation: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < equation.length;) {
    const character = equation[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (/\d/.test(character)) {
      let value = character;
      index += 1;
      while (index < equation.length && /\d/.test(equation[index])) {
        value += equation[index];
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    if (character === '*' || character === '×' || character === 'x' || character === 'X') {
      tokens.push('*');
    } else if (character === '/' || character === '÷') {
      tokens.push('/');
    } else if (character === '=') {
      tokens.push('=');
    } else {
      tokens.push(character);
    }
    index += 1;
  }
  return tokens;
}
