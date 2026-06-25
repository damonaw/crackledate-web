import {
  dailyDashboardSummaryFromSolutions,
  monthProgressText,
  streakValue,
  type DashboardSolution,
  type SavedSolutionsForDashboard,
} from './dailyDashboard';

export type ShareableSolution = DashboardSolution;
export type SavedSolutionsForShare = SavedSolutionsForDashboard;

export type DailyShareSummary = {
  displayDate: string;
  latestEquation: string;
  latestValue: string;
  streakCount: number;
  monthSolvedCount: number;
  monthAvailableCount: number;
};

export function dailyShareSummaryFromSolutions({
  dateIdentifier,
  displayDate,
  todayIdentifier,
  savedSolutions,
}: {
  dateIdentifier: string;
  displayDate: string;
  todayIdentifier: string;
  savedSolutions: SavedSolutionsForShare;
}): DailyShareSummary | null {
  const summary = dailyDashboardSummaryFromSolutions({ dateIdentifier, displayDate, todayIdentifier, savedSolutions });
  if (!summary) return null;
  return {
    displayDate: summary.displayDate,
    latestEquation: summary.latestEquation,
    latestValue: summary.latestValue,
    streakCount: summary.streakCount,
    monthSolvedCount: summary.monthSolvedCount,
    monthAvailableCount: summary.monthAvailableCount,
  };
}

export function spoilerFreeDailySharePayload(summary: DailyShareSummary): string {
  return [
    `Crackle Date - ${summary.displayDate}`,
    `Cracked with value ${displayValue(summary.latestValue)}`,
    `Streak: ${streakValue(summary.streakCount)}`,
    `Month: ${monthProgressText(summary.monthSolvedCount, summary.monthAvailableCount)}`,
    'No spoilers.',
  ].join('\n');
}

export function savedSolutionSharePayload(displayDate: string, solution: ShareableSolution): string {
  return [
    `Crackle Date - ${displayDate}`,
    solution.equation.trim() || 'Equation unavailable',
    `Value: ${displayValue(solution.value)}`,
    `Time: ${timeText(solution.seconds)}`,
  ].join('\n');
}

function displayValue(value: string): string {
  return value.trim() || '?';
}

function timeText(seconds: number): string {
  if (seconds <= 0) return 'Saved';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}
