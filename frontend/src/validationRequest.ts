export type ValidationRequestInput = {
  date: string;
  equation: string;
};

export type ValidationRequestResult =
  | { kind: 'valid'; leftValue?: string; rightValue?: string }
  | { kind: 'invalid_equation'; errorMessage?: string }
  | { kind: 'bad_request'; errorMessage: string }
  | { kind: 'rate_limited' }
  | { kind: 'temporary' }
  | { kind: 'aborted' };

export type ValidationFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function requestValidation(
  input: ValidationRequestInput,
  signal: AbortSignal,
  fetcher: ValidationFetch = fetch,
): Promise<ValidationRequestResult> {
  try {
    const response = await fetcher('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: input.date,
        equation: input.equation,
        mode: 'classic',
      }),
      signal,
    });
    if (signal.aborted) return { kind: 'aborted' };
    if (response.status === 429) return { kind: 'rate_limited' };
    if (response.status === 400) {
      const body: unknown = await response.json();
      if (signal.aborted) return { kind: 'aborted' };
      if (!isBadRequestBody(body)) return { kind: 'temporary' };
      return { kind: 'bad_request', errorMessage: body.error };
    }
    if (!response.ok) return { kind: 'temporary' };

    const body: unknown = await response.json();
    if (signal.aborted) return { kind: 'aborted' };
    if (!isValidationBody(body)) return { kind: 'temporary' };
    if (body.valid) {
      return {
        kind: 'valid',
        ...optionalValue(body, 'leftValue'),
        ...optionalValue(body, 'rightValue'),
      };
    }
    return {
      kind: 'invalid_equation',
      ...optionalValue(body, 'errorMessage'),
    };
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return { kind: 'aborted' };
    return { kind: 'temporary' };
  }
}

function isValidationBody(value: unknown): value is Record<string, unknown> & { valid: boolean } {
  return isRecord(value) &&
    typeof value.valid === 'boolean' &&
    optionalString(value, 'leftValue') &&
    optionalString(value, 'rightValue') &&
    optionalString(value, 'errorMessage');
}

function isBadRequestBody(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || typeof value[key] === 'string';
}

function optionalValue<Key extends 'leftValue' | 'rightValue' | 'errorMessage'>(
  value: Record<string, unknown>,
  key: Key,
): Partial<Record<Key, string>> {
  return typeof value[key] === 'string' ? { [key]: value[key] } as Record<Key, string> : {};
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError';
}
