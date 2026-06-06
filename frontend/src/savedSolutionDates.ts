export type SavedSolutionsByDate<T = unknown> = Record<string, readonly T[] | undefined>;

export function savedSolutionDateSet<T>(solutionsByDate: SavedSolutionsByDate<T>): Set<string> {
  return new Set(
    Object.entries(solutionsByDate)
      .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
      .map(([dateIdentifier]) => dateIdentifier),
  );
}
