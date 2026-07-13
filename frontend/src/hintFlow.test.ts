import { describe, expect, test } from 'vitest';
import {
  bindHintDataToIdentity,
  editorStatesEqual,
  hintClickAction,
  hintDataForIdentity,
  hintFailureFeedback,
  hintNoSolutionMessage,
  hintRateLimitedMessage,
  hintTemporaryMessage,
  nextVisibleHintStep,
} from './hintFlow';
import { deleteAtSelection, type EditorSelection } from './equationEditing';
import type { HintRequestIdentity } from './hintRequestCoordinator';

const identityA: HintRequestIdentity = {
  activeView: 'game',
  puzzleDate: '2026-06-19',
  playMode: 'daily',
  equation: 'A',
};
const identityB: HintRequestIdentity = { ...identityA, equation: 'B' };
const hintA = {
  solution: 'A=1',
  step1: '1',
  step2: 'A',
  step3: 'A=1',
};

type TestEditorToken = { value: string };

function keepHintUnlessEditorChanged(
  current: { tokens: TestEditorToken[]; selection: EditorSelection },
  next: { tokens: TestEditorToken[]; selection: EditorSelection },
  identifiedHint: ReturnType<typeof bindHintDataToIdentity>,
) {
  return editorStatesEqual(current, next) ? identifiedHint : null;
}

describe('hintFlow', () => {
  test('does not jump directly to the full solution on the first hint request', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 1,
        currentHintStep: 0,
      }),
    ).toBe(1);
  });

  test('shows the second hint before the full solution even when the entered equation matches it', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 2,
        currentHintStep: 1,
      }),
    ).toBe(2);
  });

  test('allows the full solution after two visible hints', () => {
    expect(
      nextVisibleHintStep({
        requestedStep: 3,
        currentHintStep: 2,
      }),
    ).toBe(3);
  });

  test('keeps a genuine no-solution response as the existing dead end', () => {
    expect(hintFailureFeedback('no_solution', '1 +')).toEqual({
      message: hintNoSolutionMessage,
      isDeadEnd: true,
    });
  });

  test('keeps an empty-prefix no-solution response in the existing puzzle-level flow', () => {
    expect(hintFailureFeedback('no_solution', '  ')).toEqual({
      message: 'Could not find any solutions for this puzzle.',
      isDeadEnd: false,
    });
  });

  test.each([
    ['rate_limited' as const, hintRateLimitedMessage],
    ['temporary' as const, hintTemporaryMessage],
  ])('keeps %s feedback recoverable', (kind, message) => {
    expect(hintFailureFeedback(kind, '1 +')).toEqual({
      message,
      isDeadEnd: false,
    });
  });

  test('does not create feedback for an abort', () => {
    expect(hintFailureFeedback('aborted', '1 +')).toBeNull();
  });

  test('only exposes hint data bound to the current request identity', () => {
    const identifiedHint = bindHintDataToIdentity(identityA, hintA);

    expect(hintDataForIdentity(identifiedHint, identityA)).toEqual(hintA);
    expect(hintDataForIdentity(identifiedHint, identityB)).toBeNull();
  });

  test('requests the current identity instead of advancing an open stale hint', () => {
    const identifiedHint = bindHintDataToIdentity(identityA, hintA);

    expect(hintClickAction({
      hintOpen: true,
      currentHintData: hintDataForIdentity(identifiedHint, identityB),
    })).toBe('request');
    expect(hintClickAction({
      hintOpen: true,
      currentHintData: hintDataForIdentity(identifiedHint, identityA),
    })).toBe('advance');
  });

  test("keeps Step 2 data visible without another request when Step 1 already inserted '='", () => {
    const stepTwoIdentity = { ...identityA, equation: '6=' };
    const boundStepTwoHint = bindHintDataToIdentity(stepTwoIdentity, hintA);
    const current = {
      tokens: [{ value: '6' }, { value: '=' }],
      selection: { kind: 'slot', index: 2 } as EditorSelection,
    };
    const next = current.tokens.some((token) => token.value === '=')
      ? { tokens: current.tokens, selection: current.selection }
      : { tokens: [...current.tokens, { value: '=' }], selection: current.selection };
    let requestCount = 1;

    if (!editorStatesEqual(current, next)) requestCount += 1;
    const identifiedHint = keepHintUnlessEditorChanged(
      current,
      next,
      boundStepTwoHint,
    );
    const visibleStep = nextVisibleHintStep({
      requestedStep: 2,
      currentHintStep: 1,
    });

    expect(current.tokens.map((token) => token.value).join('')).toBe(
      stepTwoIdentity.equation,
    );
    expect(visibleStep).toBe(2);
    expect(hintDataForIdentity(identifiedHint, stepTwoIdentity)).toEqual(hintA);
    expect(requestCount).toBe(1);
  });

  test('keeps bound hint data when backspace is a no-op in an empty editor', () => {
    const emptyIdentity = { ...identityA, equation: '' };
    const boundEmptyHint = bindHintDataToIdentity(emptyIdentity, hintA);
    const current = {
      tokens: [] as TestEditorToken[],
      selection: { kind: 'slot', index: 0 } as EditorSelection,
    };
    const next = deleteAtSelection(current.tokens, current.selection);

    expect(next.tokens).not.toBe(current.tokens);
    expect(editorStatesEqual(current, next)).toBe(true);
    expect(
      hintDataForIdentity(
        keepHintUnlessEditorChanged(current, next, boundEmptyHint),
        emptyIdentity,
      ),
    ).toEqual(hintA);
  });

  test('detects real token and selection edits so stale hint data can be retired', () => {
    const current = {
      tokens: [{ value: '6' }],
      selection: { kind: 'slot', index: 1 } as EditorSelection,
    };

    expect(editorStatesEqual(current, {
      tokens: [...current.tokens, { value: '+' }],
      selection: { kind: 'slot', index: 2 },
    })).toBe(false);
    expect(editorStatesEqual(current, {
      tokens: current.tokens,
      selection: { kind: 'token', index: 0 },
    })).toBe(false);
  });
});
