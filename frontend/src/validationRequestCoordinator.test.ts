import { describe, expect, test, vi } from 'vitest';
import {
  ValidationRequestCoordinator,
  sameValidationRequestIdentity,
  type ValidationRequestCompletion,
  type ValidationRequestIdentity,
} from './validationRequestCoordinator';
import type { ValidationRequestResult } from './validationRequest';

const valid: ValidationRequestResult = {
  kind: 'valid',
  leftValue: '16',
  rightValue: '16',
};
const baseIdentity: ValidationRequestIdentity = {
  activeView: 'game',
  puzzleDate: '2026-06-19',
  playMode: 'daily',
  equation: '6+1+9=20÷2+6',
  onboardingPhase: 'completed',
  onboardingGeneration: 4,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ValidationRequestCoordinator', () => {
  test('starts one request and coalesces same-tick submits for the same identity', async () => {
    const pending = deferred<ValidationRequestResult>();
    const request = vi.fn(() => pending.promise);
    const onResult = vi.fn<(completion: ValidationRequestCompletion) => void>();
    const coordinator = new ValidationRequestCoordinator({ request, onResult });

    coordinator.submit(baseIdentity);
    coordinator.submit({ ...baseIdentity });

    expect(request).toHaveBeenCalledOnce();
    pending.resolve(valid);
    await flushPromises();
    expect(onResult).toHaveBeenCalledOnce();
  });

  test('aborts a newer identity and ignores the older out-of-order completion', async () => {
    const first = deferred<ValidationRequestResult>();
    const second = deferred<ValidationRequestResult>();
    const signals: AbortSignal[] = [];
    const request = vi.fn((_identity: ValidationRequestIdentity, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const onResult = vi.fn<(completion: ValidationRequestCompletion) => void>();
    const coordinator = new ValidationRequestCoordinator({ request, onResult });
    const newerIdentity = { ...baseIdentity, equation: '6+1+9=20÷2+7' };

    coordinator.submit(baseIdentity);
    coordinator.submit(newerIdentity);

    expect(signals[0]?.aborted).toBe(true);
    second.resolve(valid);
    await flushPromises();
    first.resolve({ kind: 'invalid_equation', errorMessage: 'stale' });
    await flushPromises();

    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult.mock.calls[0]?.[0]).toMatchObject({
      identity: newerIdentity,
      result: valid,
    });
  });

  test.each([
    ['equation', { equation: 'different' }],
    ['puzzle date', { puzzleDate: '2026-06-20' }],
    ['active view', { activeView: 'settings' }],
    ['play mode', { playMode: 'practice' as const }],
    ['onboarding phase', { onboardingPhase: 'in_progress' }],
    ['onboarding generation', { onboardingGeneration: 5 }],
  ])('treats a changed %s as a distinct validation identity', async (_name, change) => {
    const requests: AbortSignal[] = [];
    const request = vi.fn((_identity: ValidationRequestIdentity, signal: AbortSignal) => {
      requests.push(signal);
      return new Promise<ValidationRequestResult>(() => undefined);
    });
    const coordinator = new ValidationRequestCoordinator({ request, onResult: vi.fn() });

    coordinator.submit(baseIdentity);
    coordinator.submit({ ...baseIdentity, ...change });

    expect(request).toHaveBeenCalledTimes(2);
    expect(requests[0]?.aborted).toBe(true);
  });

  test('invalidate aborts active work and makes a captured completion inert', async () => {
    const pending = deferred<ValidationRequestResult>();
    let signal: AbortSignal | undefined;
    const onResult = vi.fn<(completion: ValidationRequestCompletion) => void>();
    const onFinish = vi.fn();
    const coordinator = new ValidationRequestCoordinator({
      request: (_identity, nextSignal) => {
        signal = nextSignal;
        return pending.promise;
      },
      onResult,
      onFinish,
    });

    coordinator.submit(baseIdentity);
    coordinator.invalidate();
    pending.resolve(valid);
    await flushPromises();

    expect(signal?.aborted).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  test('clears in-flight state after a recoverable failure so Submit can retry', async () => {
    const first = deferred<ValidationRequestResult>();
    const second = deferred<ValidationRequestResult>();
    const requests = [first, second];
    let index = 0;
    const request = vi.fn(() => requests[index++]!.promise);
    const onResult = vi.fn<(completion: ValidationRequestCompletion) => void>();
    const onStart = vi.fn();
    const onFinish = vi.fn();
    const coordinator = new ValidationRequestCoordinator({
      request,
      onResult,
      onStart,
      onFinish,
    });

    coordinator.submit(baseIdentity);
    first.resolve({ kind: 'temporary' });
    await flushPromises();
    coordinator.submit(baseIdentity);
    second.resolve(valid);
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(2);
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls.map(([completion]) => completion.result.kind)).toEqual([
      'temporary',
      'valid',
    ]);
  });

  test('suppresses aborted outcomes without showing feedback', async () => {
    const onResult = vi.fn<(completion: ValidationRequestCompletion) => void>();
    const onFinish = vi.fn();
    const coordinator = new ValidationRequestCoordinator({
      request: async () => ({ kind: 'aborted' }),
      onResult,
      onFinish,
    });

    coordinator.submit(baseIdentity);
    await flushPromises();

    expect(onResult).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  test('delivers a current Practice success before finishing so persistence can precede navigation', async () => {
    const pending = deferred<ValidationRequestResult>();
    const actions: string[] = [];
    const coordinator = new ValidationRequestCoordinator({
      request: () => pending.promise,
      onResult: ({ result }) => {
        if (result.kind !== 'valid') return;
        actions.push('persist completed');
        actions.push('clear practice');
        actions.push('navigate daily');
      },
      onFinish: () => actions.push('finish'),
    });

    coordinator.submit({
      ...baseIdentity,
      activeView: 'practice',
      playMode: 'practice',
      onboardingPhase: 'in_progress',
    });
    pending.resolve(valid);
    await flushPromises();

    expect(actions).toEqual([
      'persist completed',
      'clear practice',
      'navigate daily',
      'finish',
    ]);
  });

  test('does not deliver delayed Practice success after an onboarding reset', async () => {
    const pending = deferred<ValidationRequestResult>();
    const persistCompleted = vi.fn();
    const coordinator = new ValidationRequestCoordinator({
      request: () => pending.promise,
      onResult: persistCompleted,
    });

    coordinator.submit({
      ...baseIdentity,
      activeView: 'practice',
      playMode: 'practice',
      onboardingPhase: 'completed',
    });
    coordinator.invalidate();
    pending.resolve(valid);
    await flushPromises();

    expect(persistCompleted).not.toHaveBeenCalled();
  });
});

describe('sameValidationRequestIdentity', () => {
  test('compares every gameplay and onboarding identity field', () => {
    expect(sameValidationRequestIdentity(baseIdentity, { ...baseIdentity })).toBe(true);
    expect(sameValidationRequestIdentity(baseIdentity, {
      ...baseIdentity,
      onboardingGeneration: baseIdentity.onboardingGeneration + 1,
    })).toBe(false);
  });
});
