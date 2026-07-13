import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

function openingTag(componentName: string): string {
  const start = source.indexOf(`<${componentName}\n`);
  const end = source.indexOf('/>', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

describe('first-run onboarding wiring', () => {
  test('uses one durable Practice entry callback', () => {
    expect(source).toContain('const enterPractice = useCallback(');
    expect(source).toContain('onPractice={enterPractice}');
    expect(source).toContain('onStartGuidedCrack={enterPractice}');
  });

  test('removes transient and legacy route authorities', () => {
    const removedAuthorities = [
      ['guidedFirstWin', 'Active'].join(''),
      ['initialActive', 'View('].join(''),
      ['routeForGuidedFirst', 'Win('].join(''),
    ];
    removedAuthorities.forEach((authority) => {
      expect(source).not.toContain(authority);
    });
  });

  test('persists completion before leaving Practice', () => {
    const practiceBranch = source.indexOf('if (isPracticeMode) {');
    const completionWrite = source.indexOf(
      'persistOnboardingPhase(FirstRunOnboardingPhase.Completed, true)',
      practiceBranch,
    );
    const destination = source.indexOf('practiceCompletionTarget(todayId)', practiceBranch);
    expect(completionWrite).toBeGreaterThan(practiceBranch);
    expect(destination).toBeGreaterThan(completionWrite);
  });

  test('daily completion has no onboarding mutation', () => {
    const dailyBranch = source.indexOf('const seconds = startTime');
    expect(source.slice(dailyBranch)).not.toContain('phaseAfterPracticeSuccess');
    expect(source.slice(dailyBranch)).not.toContain('persistOnboardingPhase(');
  });

  test('Home stays phase-aware while Rules Play uses its canonical transition', () => {
    const showGameStart = source.indexOf('const showGame = useCallback(');
    const showGameEnd = source.indexOf('const chooseCalendarDate', showGameStart);
    const showGameCallback = source.slice(showGameStart, showGameEnd);

    expect(showGameCallback).toContain(
      'setActiveView(homeDestinationForPhase(onboardingPhase))',
    );
    expect(source).toContain('const playFromRules = useCallback(');
    expect(source).toContain('rulesPlayDestinationForPhase(onboardingPhase)');
    expect(openingTag('WrittenRulesView')).toContain('onPlay={playFromRules}');
  });

  test('required Practice instructions detour to Rules and completed players keep details', () => {
    expect(openingTag('EquationEditor')).toContain(
      'onShowDetailedInstructions={onboardingCompleted ? showDetailedHowToPlay : showRules}',
    );
  });

  test('wires executable storage recovery and validation race guards', () => {
    expect(source).toContain('loadWebOnboardingBootstrap');
    expect(source).toContain('persistWebPreference(');
    expect(source).toContain('recoverFromOnboardingStorageFailure');
    expect(source).toContain('canApplyPracticeValidation(');
  });

  test('durably persists daily solutions before state and success effects', () => {
    expect(source).toContain('const savedSolutionsRef = useRef(savedSolutions)');
    expect(source).toContain('const currentSavedSolutions = savedSolutionsRef.current');
    const persistence = source.indexOf('if (!persistSavedSolutions(nextSavedSolutions))');
    const refUpdate = source.indexOf('savedSolutionsRef.current = nextSavedSolutions', persistence);
    const stateUpdate = source.indexOf('setSavedSolutions(nextSavedSolutions)', persistence);
    const remoteSubmission = source.indexOf('void submitSolutionRecord(', persistence);

    expect(persistence).toBeGreaterThanOrEqual(0);
    expect(refUpdate).toBeGreaterThan(persistence);
    expect(stateUpdate).toBeGreaterThan(refUpdate);
    expect(remoteSubmission).toBeGreaterThan(stateUpdate);
    expect(source.slice(persistence, stateUpdate)).toContain('setMessage(solutionStorageError)');
    expect(source).not.toContain('localStorage.setItem(storageKey');
  });
});
