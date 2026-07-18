import { describe, expect, test } from 'vitest';
import {
  completeHintFailure,
  hintFailureFeedback,
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
    ['no_solution' as const, true],
    ['temporary' as const, false],
  ])('preserves the editable equation when %s completes', (kind, isDeadEnd) => {
    const editorState = {
      tokens: [{ value: '1' }, { value: '+' }, { value: '2' }],
      selection: { kind: 'slot' as const, index: 3 },
    };

    const completion = completeHintFailure(kind, '1+2', editorState);

    expect(completion.editorState).toBe(editorState);
    expect(completion.editorState.tokens.map((token) => token.value).join('')).toBe('1+2');
    expect(completion.feedback).toEqual({
      message: 'No hint available yet',
      isDeadEnd,
    });
  });
});
