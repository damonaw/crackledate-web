import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

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
});
