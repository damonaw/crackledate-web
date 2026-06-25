import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  GuidedFirstWinRoute,
  guidedFirstWinCoachMessageFor,
  guidedFirstWinCopy,
  guidedFirstWinStorageKey,
  routeForGuidedFirstWin,
} from './guidedFirstWinPolicy';

describe('guidedFirstWinPolicy', () => {
  test('routes first-time players through Guided First Crack until completed', () => {
    expect(routeForGuidedFirstWin({
      playStarted: false,
      guidedFirstWinCompleted: false,
    })).toBe(GuidedFirstWinRoute.GuidedFirstWin);

    expect(routeForGuidedFirstWin({
      playStarted: true,
      guidedFirstWinCompleted: false,
    })).toBe(GuidedFirstWinRoute.TodayGame);

    expect(routeForGuidedFirstWin({
      playStarted: false,
      guidedFirstWinCompleted: true,
    })).toBe(GuidedFirstWinRoute.TodayGame);
  });

  test('uses the shared Guided First Crack copy contract', () => {
    expect(guidedFirstWinStorageKey).toBe('crackledate.web.guidedFirstWinCompleted.v1');
    expect(guidedFirstWinCopy.title).toBe('Guided First Crack');
    expect(guidedFirstWinCopy.body).toContain("Crack today's date");
    expect(guidedFirstWinCopy.primaryAction).toBe('Start guided crack');
    expect(guidedFirstWinCopy.secondaryAction).toBe('Read rules');
  });

  test('coaches the first guided daily solve from equation progress', () => {
    const digits = [6, 2, 5, 2, 6];

    expect(guidedFirstWinCoachMessageFor({
      tokens: [],
      puzzleDigits: digits,
      nextRequiredDigitIndex: 0,
    })).toBe("Step 1: tap the highlighted 6 to start today's crack.");

    expect(guidedFirstWinCoachMessageFor({
      tokens: [{ value: '6' }],
      puzzleDigits: digits,
      nextRequiredDigitIndex: 1,
    })).toBe('Step 2: add an equals sign when you are ready to balance both sides.');

    expect(guidedFirstWinCoachMessageFor({
      tokens: [{ value: '6' }, { value: '=' }],
      puzzleDigits: digits,
      nextRequiredDigitIndex: 1,
    })).toBe('Step 3: keep using the date digits in order until none are left.');

    expect(guidedFirstWinCoachMessageFor({
      tokens: [
        { value: '6' },
        { value: '2' },
        { value: '=' },
        { value: '5' },
        { value: '2' },
        { value: '6' },
      ],
      puzzleDigits: digits,
      nextRequiredDigitIndex: null,
    })).toBe('Step 4: submit to check whether the two sides match.');
  });

  test('web game uses the policy and in-game coach instead of generic tutorial-only onboarding', () => {
    const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(source).toContain('routeForGuidedFirstWin(');
    expect(source).toContain('guidedFirstWinCompleted');
    expect(source).toContain('guidedFirstWinCoachMessageFor(');
    expect(source).toContain('GuidedFirstWinRoute.GuidedFirstWin');
  });
});
