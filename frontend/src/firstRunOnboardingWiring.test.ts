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
    expect(source).toContain('validationRequestCoordinatorRef');
    expect(source).toContain('validationCompletionHandlerRef');
    expect(source).toContain('onboardingGeneration: onboardingTransitionRef.current.revision');
    expect(source).toContain('sameValidationRequestIdentity(');
  });

  test('invalidates validation across navigation, dates, onboarding, reset, Clear Data, and unmount', () => {
    const cancelDefinition = source.indexOf('const cancelValidationRequests = useCallback(');
    const navigation = source.indexOf('const navigateTo = useCallback(', cancelDefinition);
    const dateSelection = source.indexOf('const selectPuzzleDate = useCallback(', navigation);
    const onboardingTransition = source.indexOf('const transitionOnboardingPhase = useCallback(', dateSelection);
    const clear = source.indexOf('const clear = useCallback(', onboardingTransition);
    const clearData = source.indexOf('const clearBrowserData = useCallback(', clear);

    expect(cancelDefinition).toBeGreaterThanOrEqual(0);
    expect(source.slice(navigation, dateSelection)).toContain('cancelValidationRequests();');
    expect(source.slice(dateSelection, onboardingTransition)).toContain('cancelValidationRequests();');
    expect(source.slice(onboardingTransition, source.indexOf('const recoverFromOnboardingStorageFailure')))
      .toContain('cancelValidationRequests();');
    expect(source.slice(clear, source.indexOf('const enterPractice', clear)))
      .toContain('cancelValidationRequests();');
    expect(source.slice(clearData, source.indexOf('const showCalendar', clearData)))
      .toContain('cancelValidationRequests();');
    expect(source).toContain('return () => cancelValidationRequests();');
  });

  test('keeps required Practice completion ordered and storage failure recoverable', () => {
    const currentGuard = source.indexOf('sameValidationRequestIdentity(');
    const practiceBranch = source.indexOf('if (isPracticeMode) {', currentGuard);
    const completionWrite = source.indexOf(
      'persistOnboardingPhase(FirstRunOnboardingPhase.Completed, true)',
      practiceBranch,
    );
    const storageFailure = source.indexOf('setMessage(onboardingStorageError)', completionWrite);
    const clearPractice = source.indexOf('clear();', completionWrite);
    const destination = source.indexOf('practiceCompletionTarget(todayId)', clearPractice);

    expect(currentGuard).toBeGreaterThanOrEqual(0);
    expect(practiceBranch).toBeGreaterThan(currentGuard);
    expect(completionWrite).toBeGreaterThan(practiceBranch);
    expect(storageFailure).toBeGreaterThan(completionWrite);
    expect(clearPractice).toBeGreaterThan(storageFailure);
    expect(destination).toBeGreaterThan(clearPractice);
  });

  test('durably persists daily solutions before state and success effects', () => {
    expect(source).toContain('const savedSolutionsRef = useRef(savedSolutions)');
    expect(source).toContain('const currentSavedSolutions = savedSolutionsRef.current');
    const persistence = source.indexOf('if (!persistSavedSolutions(nextSavedSolutions))');
    const storageError = source.indexOf('setMessage(solutionStorageError)', persistence);
    const failureReturn = source.indexOf('return;', storageError);
    const refUpdate = source.indexOf('savedSolutionsRef.current = nextSavedSolutions', persistence);
    const stateUpdate = source.indexOf('setSavedSolutions(nextSavedSolutions)', persistence);
    const searchUpdate = source.indexOf('setIsSearchingAnother(false)', persistence);
    const successTone = source.indexOf("setMessageTone('success')", persistence);
    const successMessage = source.indexOf(
      'setMessage(`Solved. Both sides equal ${solution.value}.`)',
      persistence,
    );

    expect(persistence).toBeGreaterThanOrEqual(0);
    expect(storageError).toBeGreaterThan(persistence);
    expect(failureReturn).toBeGreaterThan(storageError);
    expect(refUpdate).toBeGreaterThan(failureReturn);
    expect(stateUpdate).toBeGreaterThan(refUpdate);
    expect(searchUpdate).toBeGreaterThan(stateUpdate);
    expect(successTone).toBeGreaterThan(searchUpdate);
    expect(successMessage).toBeGreaterThan(successTone);
    expect(source.slice(persistence, refUpdate)).not.toContain('savedSolutionsRef.current =');
    expect(source.slice(persistence, refUpdate)).not.toContain('setSavedSolutions(');
    expect(source.slice(persistence, refUpdate)).not.toContain('setIsSearchingAnother(false)');
    expect(source.slice(persistence, refUpdate)).not.toContain("setMessageTone('success')");
    expect(source).not.toContain('submitSolutionRecord');
    expect(source).not.toContain('localStorage.setItem(storageKey');
  });
});
