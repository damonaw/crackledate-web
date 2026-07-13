export const FirstRunOnboardingPhase = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Completed: 'completed',
} as const;

export type FirstRunOnboardingPhase =
  typeof FirstRunOnboardingPhase[keyof typeof FirstRunOnboardingPhase];

export const firstRunOnboardingStorageKey =
  'crackledate.web.first-run-onboarding.v2';
export const legacyPlayStartedStorageKey =
  'crackledate.web.play-started.v1';
export const legacyGuidedFirstWinCompletedStorageKey =
  'crackledate.web.guidedFirstWinCompleted.v1';

export type FirstRunOnboardingResolution = {
  phase: FirstRunOnboardingPhase;
  shouldPersist: boolean;
};

export type OnboardingDestination =
  | 'start'
  | 'guided_first_win'
  | 'practice'
  | 'game';

export type PracticeEntry = {
  phase: FirstRunOnboardingPhase;
  destination: 'practice';
  required: boolean;
};

export function resolveFirstRunOnboarding({
  storedPhase,
  legacyGuidedFirstWinCompleted,
  legacyPlayStarted,
}: {
  storedPhase: string | null;
  legacyGuidedFirstWinCompleted: boolean;
  legacyPlayStarted: boolean;
}): FirstRunOnboardingResolution {
  if (
    storedPhase === FirstRunOnboardingPhase.NotStarted ||
    storedPhase === FirstRunOnboardingPhase.InProgress ||
    storedPhase === FirstRunOnboardingPhase.Completed
  ) {
    return { phase: storedPhase, shouldPersist: false };
  }
  if (storedPhase !== null) {
    return { phase: FirstRunOnboardingPhase.NotStarted, shouldPersist: true };
  }
  if (legacyGuidedFirstWinCompleted || legacyPlayStarted) {
    return { phase: FirstRunOnboardingPhase.Completed, shouldPersist: true };
  }
  return { phase: FirstRunOnboardingPhase.NotStarted, shouldPersist: true };
}

export function launchDestinationForPhase(
  phase: FirstRunOnboardingPhase,
): 'start' | 'practice' | 'game' {
  if (phase === FirstRunOnboardingPhase.InProgress) return 'practice';
  if (phase === FirstRunOnboardingPhase.Completed) return 'game';
  return 'start';
}

export function playDestinationForPhase(
  phase: FirstRunOnboardingPhase,
): OnboardingDestination {
  if (phase === FirstRunOnboardingPhase.NotStarted) return 'guided_first_win';
  if (phase === FirstRunOnboardingPhase.InProgress) return 'practice';
  return 'game';
}

export function homeDestinationForPhase(
  phase: FirstRunOnboardingPhase,
): 'start' | 'game' {
  return phase === FirstRunOnboardingPhase.Completed ? 'game' : 'start';
}

export function practiceEntryForPhase(
  phase: FirstRunOnboardingPhase,
): PracticeEntry {
  if (phase === FirstRunOnboardingPhase.Completed) {
    return { phase, destination: 'practice', required: false };
  }
  return {
    phase: FirstRunOnboardingPhase.InProgress,
    destination: 'practice',
    required: true,
  };
}

export function phaseAfterPracticeSuccess(
  phase: FirstRunOnboardingPhase,
): FirstRunOnboardingPhase {
  return phase === FirstRunOnboardingPhase.InProgress
    ? FirstRunOnboardingPhase.Completed
    : phase;
}

export function phaseAfterDailySuccess(
  phase: FirstRunOnboardingPhase,
): FirstRunOnboardingPhase {
  return phase;
}

export function resetOnboardingPhase(): FirstRunOnboardingPhase {
  return FirstRunOnboardingPhase.NotStarted;
}

export function isRequiredOnboardingPractice({
  phase,
  activeView,
}: {
  phase: FirstRunOnboardingPhase;
  activeView: string;
}): boolean {
  return phase === FirstRunOnboardingPhase.InProgress &&
    activeView === 'practice';
}
