export type DashboardSolution = {
  equation: string;
  seconds: number;
  value: string;
};

export type SavedSolutionsForDashboard = Record<string, readonly DashboardSolution[] | undefined>;

export type DailyDashboardSummary = {
  dateIdentifier: string;
  displayDate: string;
  latestEquation: string;
  latestValue: string;
  latestSeconds: number;
  solvedCountForDate: number;
  streakCount: number;
  monthSolvedCount: number;
  monthAvailableCount: number;
};

export function dailyDashboardSummaryFromSolutions({
  dateIdentifier,
  displayDate,
  todayIdentifier,
  savedSolutions,
}: {
  dateIdentifier: string;
  displayDate: string;
  todayIdentifier: string;
  savedSolutions: SavedSolutionsForDashboard;
}): DailyDashboardSummary | null {
  const selectedSolutions = savedSolutions[dateIdentifier] ?? [];
  const latestSolution = selectedSolutions.at(-1);
  if (!latestSolution) return null;

  const solvedDateNumbers = Object.keys(savedSolutions)
    .filter((identifier) => (savedSolutions[identifier] ?? []).length > 0)
    .map(dateNumber)
    .filter((value): value is number => value !== null);
  const selectedDateNumber = dateNumber(dateIdentifier);
  const selectedParts = dateParts(dateIdentifier);
  const todayParts = dateParts(todayIdentifier);
  const monthAvailableCount = availableDaysInMonth(selectedParts, todayParts);
  const monthSolvedCount = Object.keys(savedSolutions).filter((identifier) => {
    if ((savedSolutions[identifier] ?? []).length === 0) return false;
    const parts = dateParts(identifier);
    return (
      parts !== null &&
      selectedParts !== null &&
      parts.year === selectedParts.year &&
      parts.month === selectedParts.month &&
      parts.day <= monthAvailableCount
    );
  }).length;

  return {
    dateIdentifier,
    displayDate,
    latestEquation: latestSolution.equation,
    latestValue: latestSolution.value,
    latestSeconds: latestSolution.seconds,
    solvedCountForDate: selectedSolutions.length,
    streakCount: selectedDateNumber === null ? 0 : streakEndingOn(selectedDateNumber, new Set(solvedDateNumbers)),
    monthSolvedCount,
    monthAvailableCount,
  };
}

export function successMessage(value: string): string {
  return `Solved. Both sides equal ${value.trim() || '?'}.`;
}

export function streakValue(count: number): string {
  const safeCount = Math.max(0, count);
  return `${safeCount} ${safeCount === 1 ? 'day' : 'days'}`;
}

export function streakDescription(count: number): string {
  return `${Math.max(0, count)} day streak ending on this date`;
}

export function monthProgressText(solvedCount: number, availableCount: number): string {
  return `${Math.max(0, solvedCount)} of ${Math.max(0, availableCount)} days cracked this month`;
}

export function solutionCountText(count: number): string {
  const safeCount = Math.max(0, count);
  return `${safeCount} saved ${safeCount === 1 ? 'solution' : 'solutions'}`;
}

function dateNumber(identifier: string): number | null {
  const parts = dateParts(identifier);
  if (!parts) return null;
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / (24 * 60 * 60 * 1000));
}

function dateParts(identifier: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = identifier.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function streakEndingOn(selectedDateNumber: number, solvedDates: ReadonlySet<number>): number {
  let cursor = selectedDateNumber;
  let count = 0;
  while (solvedDates.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

function availableDaysInMonth(
  selectedParts: { year: number; month: number; day: number } | null,
  todayParts: { year: number; month: number; day: number } | null,
): number {
  if (!selectedParts) return 0;
  const selectedMonthLength = new Date(selectedParts.year, selectedParts.month, 0).getDate();
  if (!todayParts) return selectedParts.day;

  const selectedMonthIndex = selectedParts.year * 12 + selectedParts.month;
  const todayMonthIndex = todayParts.year * 12 + todayParts.month;
  if (selectedMonthIndex < todayMonthIndex) return selectedMonthLength;
  if (selectedMonthIndex === todayMonthIndex) return Math.max(selectedParts.day, todayParts.day);
  return selectedParts.day;
}
