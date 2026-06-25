export const FUTURE_DATE_AD_DURATION_SECONDS = 30;

export type DateAccessDecision =
  | { kind: 'open'; showPastDateBanner: boolean }
  | { kind: 'future_unlock'; selectedDate: string };

export type DateAdBannerPlacement = 'none' | 'past' | 'current_solution';

export function dateAccessDecisionFor({
  selectedDate,
  today,
  unlockedFutureDates,
}: {
  selectedDate: string;
  today: string;
  unlockedFutureDates: Set<string>;
}): DateAccessDecision {
  if (selectedDate < today) {
    return { kind: 'open', showPastDateBanner: true };
  }

  if (selectedDate === today) {
    return { kind: 'open', showPastDateBanner: false };
  }

  if (unlockedFutureDates.has(selectedDate)) {
    return { kind: 'open', showPastDateBanner: false };
  }

  return { kind: 'future_unlock', selectedDate };
}

export function bannerPlacementForDate({
  selectedDate,
  today,
  savedSolutionCount,
}: {
  selectedDate: string;
  today: string;
  savedSolutionCount: number;
}): DateAdBannerPlacement {
  if (selectedDate === today) {
    return savedSolutionCount > 0 ? 'current_solution' : 'none';
  }

  if (selectedDate < today) {
    return 'past';
  }

  return 'none';
}

export function dateAfterDecliningFutureGate(today: string): string {
  return today;
}

export function dateAfterCancelingFutureGate(today: string): string {
  return today;
}
