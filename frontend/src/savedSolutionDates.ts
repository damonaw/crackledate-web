export type SavedSolutionsByDate<T = unknown> = Record<string, readonly T[] | undefined>;

export const savedSolutionsStorageKey = 'crackledate.web.solutions.v1';
export const solutionStorageError =
  'Could not save your solution. Please check browser storage and try again.';

export type SavedSolutionsStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserStorage(storage?: SavedSolutionsStorage): SavedSolutionsStorage {
  return storage ?? localStorage;
}

export function persistSavedSolutions<T>(
  solutionsByDate: SavedSolutionsByDate<T>,
  storage?: SavedSolutionsStorage,
): boolean {
  try {
    const target = browserStorage(storage);
    const serialized = JSON.stringify(solutionsByDate);
    target.setItem(savedSolutionsStorageKey, serialized);
    return target.getItem(savedSolutionsStorageKey) === serialized;
  } catch {
    return false;
  }
}

export function savedSolutionDateSet<T>(solutionsByDate: SavedSolutionsByDate<T>): Set<string> {
  return new Set(
    Object.entries(solutionsByDate)
      .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
      .map(([dateIdentifier]) => dateIdentifier),
  );
}
