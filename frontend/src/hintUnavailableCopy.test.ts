import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  hintFailureFeedback,
  hintNoSolutionMessage,
  hintRateLimitedMessage,
  hintTemporaryMessage,
} from './hintFlow';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('hint unavailable feedback', () => {
  test('keeps the recoverable Classic dead-end copy aligned across native clients', () => {
    expect(source).toContain(hintNoSolutionMessage);
    expect(hintFailureFeedback('no_solution', '1 +')).toMatchObject({ isDeadEnd: true });
  });

  test('shows recoverable feedback for throttled and temporary failures', () => {
    expect(hintRateLimitedMessage).toBe(
      'Too many hint requests at once. Please wait a moment and try again.',
    );
    expect(hintTemporaryMessage).toBe(
      'Could not load a hint right now. Your equation is still here—try again.',
    );
    expect(hintFailureFeedback('rate_limited', '1 +')).toMatchObject({ isDeadEnd: false });
    expect(hintFailureFeedback('temporary', '1 +')).toMatchObject({ isDeadEnd: false });
    expect(source).toContain('hintFailureFeedback(result.kind');
  });
});
