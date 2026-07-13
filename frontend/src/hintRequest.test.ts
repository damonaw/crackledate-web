import { describe, expect, test, vi } from 'vitest';
import { requestHint, type HintFetch } from './hintRequest';

const validHint = {
  solution: '1+2=3',
  step1: '3',
  step2: '1+2',
  step3: '1+2=3',
  balancingHint: 'Balance both sides.',
  mathTip: 'Addition is commutative.',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestHint', () => {
  test('forwards the AbortSignal and returns a validated success response', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<HintFetch>().mockResolvedValue(response(validHint));

    const result = await requestHint(
      {
        date: '2026-06-19',
        mode: 'classic',
        prefix: '1 + 2',
      },
      controller.signal,
      fetcher,
    );

    expect(result).toEqual({ kind: 'success', hint: validHint });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/hint?date=2026-06-19&mode=classic&prefix=1+%2B+2',
      { signal: controller.signal },
    );
  });

  test('classifies aborts silently', async () => {
    const controller = new AbortController();
    const fetcher: HintFetch = async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    };

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '' },
        controller.signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'aborted' });
  });

  test('classifies a genuine 404 as no_solution', async () => {
    const fetcher: HintFetch = async () => response({ error: 'No solution found' }, 404);

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '1+' },
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'no_solution' });
  });

  test('classifies a 429 as rate_limited', async () => {
    const fetcher: HintFetch = async () => response({ error: 'Too many requests' }, 429);

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '' },
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'rate_limited' });
  });

  test.each([500, 503])('classifies HTTP %s as temporary', async (status) => {
    const fetcher: HintFetch = async () => response({ error: 'Unavailable' }, status);

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '' },
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'temporary' });
  });

  test('classifies network rejection as temporary', async () => {
    const fetcher: HintFetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '' },
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'temporary' });
  });

  test.each([
    ['malformed JSON', new Response('{not-json', { status: 200 })],
    ['missing fields', response({ solution: '1+2=3', step1: '3' })],
    ['wrong field types', response({ ...validHint, step2: 42 })],
    ['wrong optional field types', response({ ...validHint, mathTip: null })],
  ])('classifies a %s response as temporary', async (_name, malformedResponse) => {
    const fetcher: HintFetch = async () => malformedResponse;

    await expect(
      requestHint(
        { date: '2026-06-19', mode: 'classic', prefix: '' },
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual({ kind: 'temporary' });
  });
});
