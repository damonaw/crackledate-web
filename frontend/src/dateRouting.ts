const datePathPattern = /^\/date\/(\d{4}-\d{2}-\d{2})\/?$/;

export function isDateIdentifier(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function dateFromRouteLocation(location: URL): string | null {
  const pathMatch = datePathPattern.exec(location.pathname);
  if (pathMatch?.[1] && isDateIdentifier(pathMatch[1])) {
    return pathMatch[1];
  }

  const queryDate = location.searchParams.get('date') ?? '';
  return isDateIdentifier(queryDate) ? queryDate : null;
}

export function routeForPuzzleDate(dateIdentifier: string, todayIdentifier: string): string {
  return dateIdentifier === todayIdentifier ? '/' : `/date/${dateIdentifier}`;
}

export function canonicalPuzzlePath(location: URL, todayIdentifier: string): string | null {
  const dateIdentifier = dateFromRouteLocation(location);
  return dateIdentifier ? routeForPuzzleDate(dateIdentifier, todayIdentifier) : null;
}
