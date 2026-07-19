import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  HintRequestCoordinator,
  type HintRequestCompletion,
  type HintRequestIdentity,
} from './hintRequestCoordinator';
import type { HintRequestResult } from './hintRequest';
import {
  bindHintDataToIdentity,
  hintClickAction,
  hintDataForIdentity,
  type IdentifiedHintData,
} from './hintFlow';

const hint = {
  solution: '1+2=3',
  step1: '3',
  step2: '1+2',
  step3: '1+2=3',
};
const success: HintRequestResult = { kind: 'success', hint };
const baseIdentity: HintRequestIdentity = {
  activeView: 'game',
  puzzleDate: '2026-06-19',
  playMode: 'daily',
  equation: '',
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

afterEach(() => {
  vi.useRealTimers();
});

describe('HintRequestCoordinator', () => {
  test('starts an explicit request immediately and coalesces same-tick duplicates', async () => {
    const pending = deferred<HintRequestResult>();
    const request = vi.fn(() => pending.promise);
    const onResult = vi.fn<(completion: HintRequestCompletion) => void>();
    const coordinator = new HintRequestCoordinator({ request, onResult });

    coordinator.requestExplicit(baseIdentity);
    coordinator.requestExplicit({ ...baseIdentity });

    expect(request).toHaveBeenCalledOnce();
    pending.resolve(success);
    await flushPromises();
    expect(onResult).toHaveBeenCalledOnce();
  });

  test('waits exactly 300 ms before a reactive request', () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => success);
    const coordinator = new HintRequestCoordinator({ request, onResult: vi.fn() });

    coordinator.requestReactive(baseIdentity);
    vi.advanceTimersByTime(299);
    expect(request).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(request).toHaveBeenCalledOnce();
  });

  test('promotes an identical pending reactive request when explicitly requested', () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => success);
    const coordinator = new HintRequestCoordinator({ request, onResult: vi.fn() });

    coordinator.requestReactive(baseIdentity);
    coordinator.requestExplicit({ ...baseIdentity });

    expect(request).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(300);
    expect(request).toHaveBeenCalledOnce();
  });

  test('aborts an older identity and ignores its out-of-order completion', async () => {
    const first = deferred<HintRequestResult>();
    const second = deferred<HintRequestResult>();
    const signals: AbortSignal[] = [];
    const request = vi.fn((_identity: HintRequestIdentity, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const onResult = vi.fn<(completion: HintRequestCompletion) => void>();
    const coordinator = new HintRequestCoordinator({ request, onResult });
    const newerIdentity = { ...baseIdentity, equation: '1' };

    coordinator.requestExplicit(baseIdentity);
    coordinator.requestExplicit(newerIdentity);

    expect(signals[0]?.aborted).toBe(true);
    second.resolve(success);
    await flushPromises();
    first.resolve({ kind: 'no_solution' });
    await flushPromises();

    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult.mock.calls[0]?.[0]).toMatchObject({
      identity: newerIdentity,
      result: success,
    });
  });

  test.each([
    ['equation', { equation: '1' }],
    ['puzzle date', { puzzleDate: '2026-06-20' }],
    ['Practice mode', { playMode: 'practice' as const }],
    ['Home', { activeView: 'start' }],
    ['Rules', { activeView: 'rules' }],
    ['Settings', { activeView: 'settings' }],
    ['Calendar', { activeView: 'calendar' }],
    ['How to Play', { activeView: 'howToPlay' }],
  ])('treats a changed %s context as a new identity', (_name, change) => {
    const signals: AbortSignal[] = [];
    const request = vi.fn((_identity: HintRequestIdentity, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<HintRequestResult>(() => undefined);
    });
    const coordinator = new HintRequestCoordinator({ request, onResult: vi.fn() });

    coordinator.requestExplicit(baseIdentity);
    coordinator.requestExplicit({ ...baseIdentity, ...change });

    expect(request).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
  });

  test('invalidate aborts work and prevents stale feedback', async () => {
    const pending = deferred<HintRequestResult>();
    let signal: AbortSignal | undefined;
    const onResult = vi.fn<(completion: HintRequestCompletion) => void>();
    const onFinish = vi.fn();
    const coordinator = new HintRequestCoordinator({
      request: (_identity, nextSignal) => {
        signal = nextSignal;
        return pending.promise;
      },
      onResult,
      onFinish,
    });

    coordinator.requestExplicit(baseIdentity);
    coordinator.invalidate();
    pending.resolve({ kind: 'temporary' });
    await flushPromises();

    expect(signal?.aborted).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  test('does not duplicate the initial fetch when hint step 0 becomes 1', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => success);
    const coordinator = new HintRequestCoordinator({ request, onResult: vi.fn() });

    coordinator.requestExplicit(baseIdentity);
    await flushPromises();
    coordinator.requestReactive({ ...baseIdentity });
    await vi.advanceTimersByTimeAsync(300);

    expect(request).toHaveBeenCalledOnce();
  });

  test('suppresses aborted outcomes even when the request aborts itself', async () => {
    const onResult = vi.fn<(completion: HintRequestCompletion) => void>();
    const coordinator = new HintRequestCoordinator({
      request: async () => ({ kind: 'aborted' }),
      onResult,
    });

    coordinator.requestExplicit(baseIdentity);
    await flushPromises();

    expect(onResult).not.toHaveBeenCalled();
  });

  test.each(['temporary', 'rate_limited'] as const)(
    'never advances hint A after equation B is pending or returns %s',
    async (failureKind) => {
      vi.useFakeTimers();
      const identityA = { ...baseIdentity, equation: 'A' };
      const identityB = { ...baseIdentity, equation: 'B' };
      const hintA = { ...hint, solution: 'A=1', step2: 'A', step3: 'A=1' };
      const hintB = { ...hint, solution: 'B=2', step2: 'B', step3: 'B=2' };
      const pendingA = deferred<HintRequestResult>();
      const pendingBFailure = deferred<HintRequestResult>();
      const pendingBRetry = deferred<HintRequestResult>();
      const requests = [pendingA, pendingBFailure, pendingBRetry];
      let requestIndex = 0;
      let currentIdentity = identityA;
      let identifiedHint: IdentifiedHintData | null = null;
      const advancedSolutions: string[] = [];
      const request = vi.fn(() => requests[requestIndex++]!.promise);
      const coordinator = new HintRequestCoordinator({
        request,
        onResult: ({ identity, result }) => {
          identifiedHint = result.kind === 'success'
            ? bindHintDataToIdentity(identity, result.hint)
            : null;
        },
      });
      const clickOpenHint = () => {
        const currentHintData = hintDataForIdentity(identifiedHint, currentIdentity);
        if (hintClickAction({ hintOpen: true, currentHintData }) === 'request') {
          coordinator.requestExplicit(currentIdentity);
          return;
        }
        advancedSolutions.push(currentHintData!.solution);
      };

      coordinator.requestExplicit(identityA);
      pendingA.resolve({ kind: 'success', hint: hintA });
      await flushPromises();
      clickOpenHint();
      expect(advancedSolutions).toEqual(['A=1']);

      currentIdentity = identityB;
      coordinator.invalidate();
      identifiedHint = null;
      coordinator.requestReactive(identityB);

      clickOpenHint();
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[1]?.[0]).toEqual(identityB);
      expect(advancedSolutions).toEqual(['A=1']);
      await vi.advanceTimersByTimeAsync(300);
      expect(request).toHaveBeenCalledTimes(2);

      pendingBFailure.resolve({ kind: failureKind });
      await flushPromises();
      clickOpenHint();
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls[2]?.[0]).toEqual(identityB);
      expect(advancedSolutions).toEqual(['A=1']);

      pendingBRetry.resolve({ kind: 'success', hint: hintB });
      await flushPromises();
      clickOpenHint();
      expect(advancedSolutions).toEqual(['A=1', 'B=2']);
    },
  );
});
