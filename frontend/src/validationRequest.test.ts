import { describe, expect, test, vi } from 'vitest';
import { requestValidation, type ValidationFetch } from './validationRequest';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestValidation', () => {
  test('posts the classic validation contract with the supplied AbortSignal', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<ValidationFetch>().mockResolvedValue(response({
      valid: true,
      leftValue: '16',
      rightValue: '16',
    }));

    await expect(requestValidation(
      { date: '2026-06-19', equation: '6+1+9=20÷2+6' },
      controller.signal,
      fetcher,
    )).resolves.toEqual({
      kind: 'valid',
      leftValue: '16',
      rightValue: '16',
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-06-19',
        equation: '6+1+9=20÷2+6',
        mode: 'classic',
      }),
      signal: controller.signal,
    });
  });

  test('treats valid false as ordinary equation feedback', async () => {
    const fetcher: ValidationFetch = async () => response({
      valid: false,
      errorMessage: 'Both sides must have the same value',
    });

    await expect(requestValidation(
      { date: '2026-06-19', equation: '6+1+9=20+2+6' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({
      kind: 'invalid_equation',
      errorMessage: 'Both sides must have the same value',
    });
  });

  test('accepts omitted optional strings on valid and invalid equation responses', async () => {
    const responses = [response({ valid: true }), response({ valid: false })];
    const fetcher = vi.fn<ValidationFetch>()
      .mockResolvedValueOnce(responses[0]!)
      .mockResolvedValueOnce(responses[1]!);
    const signal = new AbortController().signal;

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      signal,
      fetcher,
    )).resolves.toEqual({ kind: 'valid' });
    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=2' },
      signal,
      fetcher,
    )).resolves.toEqual({ kind: 'invalid_equation' });
  });

  test('keeps a well-shaped HTTP 400 distinct as a bad request', async () => {
    const fetcher: ValidationFetch = async () => response({ error: 'Invalid date' }, 400);

    await expect(requestValidation(
      { date: 'not-a-date', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'bad_request', errorMessage: 'Invalid date' });
  });

  test.each([
    ['malformed JSON', new Response('{not-json', { status: 400 })],
    ['missing error', response({}, 400)],
    ['wrong error type', response({ error: 400 }, 400)],
  ])('treats a 400 with %s as temporary', async (_name, malformedResponse) => {
    const fetcher: ValidationFetch = async () => malformedResponse;

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'temporary' });
  });

  test('classifies HTTP 429 separately', async () => {
    const fetcher: ValidationFetch = async () => response({ error: 'Too many requests' }, 429);

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'rate_limited' });
  });

  test.each([401, 404, 500, 503])('classifies HTTP %s as temporary', async (status) => {
    const fetcher: ValidationFetch = async () => response({ error: 'Unavailable' }, status);

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'temporary' });
  });

  test.each([
    ['malformed JSON', new Response('{not-json', { status: 200 })],
    ['non-object', response(null)],
    ['missing valid', response({ leftValue: '16' })],
    ['wrong valid type', response({ valid: 'true' })],
    ['wrong valid value field', response({ valid: true, leftValue: 16 })],
    ['wrong invalid value field', response({ valid: false, errorMessage: null })],
  ])('classifies a 200 response with %s as temporary', async (_name, malformedResponse) => {
    const fetcher: ValidationFetch = async () => malformedResponse;

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'temporary' });
  });

  test('classifies network rejection as temporary', async () => {
    const fetcher: ValidationFetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      new AbortController().signal,
      fetcher,
    )).resolves.toEqual({ kind: 'temporary' });
  });

  test('classifies aborts silently', async () => {
    const controller = new AbortController();
    const fetcher: ValidationFetch = async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    };

    await expect(requestValidation(
      { date: '2026-06-19', equation: '1=1' },
      controller.signal,
      fetcher,
    )).resolves.toEqual({ kind: 'aborted' });
  });
});
