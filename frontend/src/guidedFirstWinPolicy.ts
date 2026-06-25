export enum GuidedFirstWinRoute {
  GuidedFirstWin = 'guided_first_win',
  TodayGame = 'today_game',
}

export type GuidedFirstWinCopy = {
  title: string;
  body: string;
  primaryAction: string;
  secondaryAction: string;
};

export type GuidedFirstWinToken = {
  value: string;
};

export const guidedFirstWinStorageKey = 'crackledate.web.guidedFirstWinCompleted.v1';

export const guidedFirstWinCopy: GuidedFirstWinCopy = {
  title: 'Guided First Crack',
  body: "Crack today's date by building a balanced equation. We will guide the first few taps, then hand you into the daily puzzle.",
  primaryAction: 'Start guided crack',
  secondaryAction: 'Read rules',
};

export function routeForGuidedFirstWin({
  playStarted,
  guidedFirstWinCompleted,
}: {
  playStarted: boolean;
  guidedFirstWinCompleted: boolean;
}): GuidedFirstWinRoute {
  return !playStarted && !guidedFirstWinCompleted
    ? GuidedFirstWinRoute.GuidedFirstWin
    : GuidedFirstWinRoute.TodayGame;
}

export function guidedFirstWinCoachMessageFor({
  tokens,
  puzzleDigits,
  nextRequiredDigitIndex,
}: {
  tokens: readonly GuidedFirstWinToken[];
  puzzleDigits: readonly number[];
  nextRequiredDigitIndex: number | null;
}): string {
  if (tokens.length === 0) {
    const activeDigit = puzzleDigits[0]?.toString() ?? 'date digit';
    return `Step 1: tap the highlighted ${activeDigit} to start today's crack.`;
  }

  const equation = tokens.map((token) => token.value).join('');
  if (countEqualsSigns(equation) !== 1) {
    return 'Step 2: add an equals sign when you are ready to balance both sides.';
  }

  if (nextRequiredDigitIndex !== null) {
    return 'Step 3: keep using the date digits in order until none are left.';
  }

  return 'Step 4: submit to check whether the two sides match.';
}

function countEqualsSigns(value: string): number {
  return Array.from(value).filter((char) => char === '=').length;
}
