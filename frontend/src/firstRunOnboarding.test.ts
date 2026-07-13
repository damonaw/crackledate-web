import { describe, expect, test } from 'vitest';
import {
  FirstRunOnboardingPhase as Phase,
  firstRunOnboardingStorageKey,
  homeDestinationForPhase,
  isRequiredOnboardingPractice,
  launchDestinationForPhase,
  legacyGuidedFirstWinCompletedStorageKey,
  legacyPlayStartedStorageKey,
  phaseAfterDailySuccess,
  phaseAfterPracticeSuccess,
  playDestinationForPhase,
  practiceEntryForPhase,
  resetOnboardingPhase,
  resolveFirstRunOnboarding,
} from './firstRunOnboarding';

describe('first-run onboarding migration', () => {
  test('uses the exact versioned keys', () => {
    expect(firstRunOnboardingStorageKey)
      .toBe('crackledate.web.first-run-onboarding.v2');
    expect(legacyGuidedFirstWinCompletedStorageKey)
      .toBe('crackledate.web.guidedFirstWinCompleted.v1');
    expect(legacyPlayStartedStorageKey)
      .toBe('crackledate.web.play-started.v1');
  });

  test('fresh storage migrates to not_started', () => {
    expect(resolveFirstRunOnboarding({
      storedPhase: null,
      legacyGuidedFirstWinCompleted: false,
      legacyPlayStarted: false,
    })).toEqual({ phase: Phase.NotStarted, shouldPersist: true });
  });

  test.each([Phase.NotStarted, Phase.InProgress, Phase.Completed])(
    'recognized V2 phase %s wins over legacy markers',
    (storedPhase) => {
      expect(resolveFirstRunOnboarding({
        storedPhase,
        legacyGuidedFirstWinCompleted: true,
        legacyPlayStarted: true,
      })).toEqual({ phase: storedPhase, shouldPersist: false });
    },
  );

  test('corrupt V2 state fails closed despite legacy completion', () => {
    expect(resolveFirstRunOnboarding({
      storedPhase: 'future_value',
      legacyGuidedFirstWinCompleted: true,
      legacyPlayStarted: true,
    })).toEqual({ phase: Phase.NotStarted, shouldPersist: true });
  });

  test.each([
    { guided: true, played: false },
    { guided: false, played: true },
    { guided: true, played: true },
  ])('legacy established-player state migrates to completed', ({ guided, played }) => {
    expect(resolveFirstRunOnboarding({
      storedPhase: null,
      legacyGuidedFirstWinCompleted: guided,
      legacyPlayStarted: played,
    })).toEqual({ phase: Phase.Completed, shouldPersist: true });
  });
});

describe('first-run onboarding routing and transitions', () => {
  test('routes launch and Play from the authoritative phase', () => {
    expect(launchDestinationForPhase(Phase.NotStarted)).toBe('start');
    expect(launchDestinationForPhase(Phase.InProgress)).toBe('practice');
    expect(launchDestinationForPhase(Phase.Completed)).toBe('game');
    expect(playDestinationForPhase(Phase.NotStarted)).toBe('guided_first_win');
    expect(playDestinationForPhase(Phase.InProgress)).toBe('practice');
    expect(playDestinationForPhase(Phase.Completed)).toBe('game');
  });

  test('first-run Practice is required and completed Practice is optional', () => {
    expect(practiceEntryForPhase(Phase.NotStarted)).toEqual({
      phase: Phase.InProgress,
      destination: 'practice',
      required: true,
    });
    expect(practiceEntryForPhase(Phase.InProgress)).toEqual({
      phase: Phase.InProgress,
      destination: 'practice',
      required: true,
    });
    expect(practiceEntryForPhase(Phase.Completed)).toEqual({
      phase: Phase.Completed,
      destination: 'practice',
      required: false,
    });
  });

  test('Back and Home cannot bypass required Practice', () => {
    expect(homeDestinationForPhase(Phase.NotStarted)).toBe('start');
    expect(homeDestinationForPhase(Phase.InProgress)).toBe('start');
    expect(homeDestinationForPhase(Phase.Completed)).toBe('game');
  });

  test('only in-progress Practice success completes onboarding', () => {
    expect(phaseAfterPracticeSuccess(Phase.NotStarted)).toBe(Phase.NotStarted);
    expect(phaseAfterPracticeSuccess(Phase.InProgress)).toBe(Phase.Completed);
    expect(phaseAfterPracticeSuccess(Phase.Completed)).toBe(Phase.Completed);
  });

  test.each([Phase.NotStarted, Phase.InProgress, Phase.Completed])(
    'daily success preserves %s',
    (phase) => expect(phaseAfterDailySuccess(phase)).toBe(phase),
  );

  test('reset returns to not_started and guided context is derived', () => {
    expect(resetOnboardingPhase()).toBe(Phase.NotStarted);
    expect(isRequiredOnboardingPractice({
      phase: Phase.InProgress,
      activeView: 'practice',
    })).toBe(true);
    expect(isRequiredOnboardingPractice({
      phase: Phase.Completed,
      activeView: 'practice',
    })).toBe(false);
    expect(isRequiredOnboardingPractice({
      phase: Phase.InProgress,
      activeView: 'start',
    })).toBe(false);
  });
});
