import { describe, expect, test } from 'vitest';
import {
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
    expect(equation).toBe('1 +');
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
    expect(equation).toBe('1 +');
  });
});
