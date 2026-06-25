export type GuidedPracticeToken = {
  value: string;
  digitIndex?: number;
};

export type GuidedPracticeHighlight =
  | { kind: 'digit'; value: number; digitIndex: number }
  | { kind: 'operator'; value: string; label: string }
  | { kind: 'submit' }
  | { kind: 'clear' };

export type GuidedPracticeStep = {
  stepNumber: number;
  totalSteps: number;
  instruction: string;
  highlight: GuidedPracticeHighlight;
};

type GuidedPracticeAction = {
  tokenValue: string;
  highlight: Exclude<GuidedPracticeHighlight, { kind: 'submit' } | { kind: 'clear' }>;
  instruction: string;
};

const actions: GuidedPracticeAction[] = [
  {
    tokenValue: '6',
    highlight: { kind: 'digit', value: 6, digitIndex: 0 },
    instruction: 'Step 1 of 13: tap the highlighted 6.',
  },
  {
    tokenValue: '+',
    highlight: { kind: 'operator', value: '+', label: '+' },
    instruction: 'Step 2 of 13: tap +.',
  },
  {
    tokenValue: '1',
    highlight: { kind: 'digit', value: 1, digitIndex: 1 },
    instruction: 'Step 3 of 13: tap the highlighted 1.',
  },
  {
    tokenValue: '+',
    highlight: { kind: 'operator', value: '+', label: '+' },
    instruction: 'Step 4 of 13: tap +.',
  },
  {
    tokenValue: '9',
    highlight: { kind: 'digit', value: 9, digitIndex: 2 },
    instruction: 'Step 5 of 13: tap the highlighted 9.',
  },
  {
    tokenValue: '=',
    highlight: { kind: 'operator', value: '=', label: '=' },
    instruction: 'Step 6 of 13: tap = to balance the equation.',
  },
  {
    tokenValue: '2',
    highlight: { kind: 'digit', value: 2, digitIndex: 3 },
    instruction: 'Step 7 of 13: tap the highlighted 2.',
  },
  {
    tokenValue: '0',
    highlight: { kind: 'digit', value: 0, digitIndex: 4 },
    instruction: 'Step 8 of 13: tap the highlighted 0.',
  },
  {
    tokenValue: '÷',
    highlight: { kind: 'operator', value: '÷', label: '÷' },
    instruction: 'Step 9 of 13: tap ÷.',
  },
  {
    tokenValue: '2',
    highlight: { kind: 'digit', value: 2, digitIndex: 5 },
    instruction: 'Step 10 of 13: tap the highlighted 2.',
  },
  {
    tokenValue: '+',
    highlight: { kind: 'operator', value: '+', label: '+' },
    instruction: 'Step 11 of 13: tap +.',
  },
  {
    tokenValue: '6',
    highlight: { kind: 'digit', value: 6, digitIndex: 6 },
    instruction: 'Step 12 of 13: tap the highlighted 6.',
  },
];

export const guidedPracticeSolution = actions.map((action) => action.tokenValue).join('');
export const guidedPracticeTotalSteps = actions.length + 1;

export function guidedPracticeStepForTokens(tokens: readonly GuidedPracticeToken[]): GuidedPracticeStep {
  const expectedPrefix = actions.slice(0, tokens.length);
  const followsGuidedSolution =
    tokens.length <= actions.length &&
    tokens.every((token, index) => token.value === expectedPrefix[index]?.tokenValue);

  if (!followsGuidedSolution) {
    return {
      stepNumber: 1,
      totalSteps: guidedPracticeTotalSteps,
      instruction: 'Tap Clear to restart the guided practice solution.',
      highlight: { kind: 'clear' },
    };
  }

  if (tokens.length === actions.length) {
    return {
      stepNumber: guidedPracticeTotalSteps,
      totalSteps: guidedPracticeTotalSteps,
      instruction: 'Step 13 of 13: tap Submit to finish the practice round.',
      highlight: { kind: 'submit' },
    };
  }

  const action = actions[tokens.length]!;
  return {
    stepNumber: tokens.length + 1,
    totalSteps: guidedPracticeTotalSteps,
    instruction: action.instruction,
    highlight: action.highlight,
  };
}

export function guidedPracticeGlowKey(step: GuidedPracticeStep | null): string | null {
  if (!step) return null;
  switch (step.highlight.kind) {
    case 'digit':
      return 'digit';
    case 'operator':
      return step.highlight.value;
    case 'submit':
      return 'Submit';
    case 'clear':
      return 'Clear';
  }
}
