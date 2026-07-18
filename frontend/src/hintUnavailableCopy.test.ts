import { describe, expect, test } from 'vitest';
import {
  hintFailureFeedback,
  hintFailureStateTransition,
  hintNoSolutionMessage,
  hintRateLimitedMessage,
  hintTemporaryMessage,
} from './hintFlow';

describe('hint unavailable feedback', () => {
  test('uses the exact unavailable copy for a recoverable Classic dead end', () => {
    const equation = '1 +';

    expect(hintNoSolutionMessage).toBe('No hint available yet');
    expect(hintFailureFeedback('no_solution', equation)).toEqual({
      message: 'No hint available yet',
      isDeadEnd: true,
    });
  });

  test('shows recoverable feedback for throttled and temporary failures', () => {
    expect(hintRateLimitedMessage).toBe(
      'Too many hint requests at once. Please wait a moment and try again.',
    );
    expect(hintTemporaryMessage).toBe('No hint available yet');
    expect(hintFailureFeedback('rate_limited', '1 +')).toMatchObject({ isDeadEnd: false });
    const equation = '1 +';
    expect(hintFailureFeedback('temporary', equation)).toEqual({
      message: 'No hint available yet',
      isDeadEnd: false,
    });
  });

  test.each([
    ['no_solution' as const, 'No hint available yet', true],
    ['temporary' as const, 'No hint available yet', false],
    [
      'rate_limited' as const,
      'Too many hint requests at once. Please wait a moment and try again.',
      false,
    ],
  ])('applies a non-destructive editor transition when %s completes', (
    kind,
    message,
    isDeadEnd,
  ) => {
    const editorState = {
      tokens: [{ value: '1' }, { value: '+' }, { value: '2' }],
      selection: { kind: 'slot' as const, index: 3 },
    };

    const transition = hintFailureStateTransition(kind, '1+2', editorState);

    expect(transition).toMatchObject({
      hintData: null,
      messageTone: 'error',
      message,
      isDeadEnd,
    });
    expect(transition?.editorState).toBe(editorState);
    expect(transition?.editorState.tokens.map((token) => token.value).join('')).toBe('1+2');
  });

  test('does not transition editor state for an aborted hint request', () => {
    const editorState = {
      tokens: [{ value: '1' }],
      selection: { kind: 'slot' as const, index: 1 },
    };

    expect(hintFailureStateTransition('aborted', '1', editorState)).toBeNull();
  });
});
