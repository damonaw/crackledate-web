import { describe, expect, test } from 'vitest';
import { statusToastDismissMs } from './notificationTiming';

describe('statusToastDismissMs', () => {
  test('dismisses notifications after five seconds', () => {
    expect(statusToastDismissMs).toBe(5_000);
  });
});
