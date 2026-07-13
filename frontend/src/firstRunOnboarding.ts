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
export const themePreferenceStorageKey = 'crackledate.web.theme.v1';
export const difficultyModeStorageKey = 'crackledate.web.difficulty.v1';
export const onboardingStorageError =
  'Could not save Practice Round progress. Please try again.';

export type ThemePreference = 'system' | 'light' | 'dark';
export type DifficultyMode = 'easy' | 'hard';

export type WebStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type WebOnboardingBootstrap = {
  phase: FirstRunOnboardingPhase;
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  errorMessage: string;
};

export type OnboardingTransitionState = {
  phase: FirstRunOnboardingPhase;
  revision: number;
};

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

function fallbackWebOnboardingBootstrap(): WebOnboardingBootstrap {
  return {
    phase: FirstRunOnboardingPhase.NotStarted,
    themePreference: 'light',
    difficultyMode: 'easy',
    errorMessage: onboardingStorageError,
  };
}

function webStorage(storage?: WebStorage): WebStorage {
  return storage ?? localStorage;
}

export function persistOnboardingPhase(
  phase: FirstRunOnboardingPhase,
  mirrorLegacyCompletion = false,
  storage?: WebStorage,
): boolean {
  try {
    const target = webStorage(storage);
    if (mirrorLegacyCompletion) {
      target.setItem(legacyGuidedFirstWinCompletedStorageKey, 'true');
      target.setItem(legacyPlayStartedStorageKey, 'true');
    }
    target.setItem(firstRunOnboardingStorageKey, phase);
    return target.getItem(firstRunOnboardingStorageKey) === phase;
  } catch {
    return false;
  }
}

export function loadWebOnboardingBootstrap(
  storage?: WebStorage,
): WebOnboardingBootstrap {
  try {
    const target = webStorage(storage);
    const resolution = resolveFirstRunOnboarding({
      storedPhase: target.getItem(firstRunOnboardingStorageKey),
      legacyGuidedFirstWinCompleted:
        target.getItem(legacyGuidedFirstWinCompletedStorageKey) === 'true',
      legacyPlayStarted:
        target.getItem(legacyPlayStartedStorageKey) === 'true',
    });
    if (resolution.shouldPersist &&
        !persistOnboardingPhase(resolution.phase, false, target)) {
      return fallbackWebOnboardingBootstrap();
    }

    const storedThemePreference = target.getItem(themePreferenceStorageKey);
    const themePreference =
      storedThemePreference === 'light' ||
      storedThemePreference === 'dark' ||
      storedThemePreference === 'system'
        ? storedThemePreference
        : 'light';
    const difficultyMode =
      target.getItem(difficultyModeStorageKey) === 'hard' ? 'hard' : 'easy';

    return {
      phase: resolution.phase,
      themePreference,
      difficultyMode,
      errorMessage: '',
    };
  } catch {
    return fallbackWebOnboardingBootstrap();
  }
}

export function clearOnboardingStorage(storage?: WebStorage): boolean {
  try {
    const target = webStorage(storage);
    target.removeItem(legacyPlayStartedStorageKey);
    target.removeItem(legacyGuidedFirstWinCompletedStorageKey);
    target.removeItem(firstRunOnboardingStorageKey);
    return true;
  } catch {
    return false;
  }
}

export function persistWebPreference(
  key: string,
  value: string,
  storage?: WebStorage,
): boolean {
  try {
    const target = webStorage(storage);
    target.setItem(key, value);
    return target.getItem(key) === value;
  } catch {
    return false;
  }
}

export function createOnboardingTransitionState(
  phase: FirstRunOnboardingPhase,
): OnboardingTransitionState {
  return { phase, revision: 0 };
}

export function capturePracticeValidation(
  state: OnboardingTransitionState,
): OnboardingTransitionState {
  return { ...state };
}

export function advanceOnboardingTransition(
  state: OnboardingTransitionState,
  phase: FirstRunOnboardingPhase,
): OnboardingTransitionState {
  return { phase, revision: state.revision + 1 };
}

export function canApplyPracticeValidation(
  ticket: OnboardingTransitionState,
  currentState: OnboardingTransitionState,
): boolean {
  return ticket.phase === currentState.phase &&
    ticket.revision === currentState.revision;
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
