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

  test('Rules Back to Game returns incomplete players through phase-aware Home', () => {
    const showGameStart = source.indexOf('const showGame = useCallback(');
    const showGameEnd = source.indexOf('const chooseCalendarDate', showGameStart);
    const showGameCallback = source.slice(showGameStart, showGameEnd);

    expect(showGameCallback).toContain(
      'setActiveView(homeDestinationForPhase(onboardingPhase))',
    );
    expect(openingTag('WrittenRulesView')).toContain('onPlay={showGame}');
  });

  test('required Practice instructions detour to Rules and completed players keep details', () => {
    expect(openingTag('EquationEditor')).toContain(
      'onShowDetailedInstructions={onboardingCompleted ? showDetailedHowToPlay : showRules}',
    );
  });
});
