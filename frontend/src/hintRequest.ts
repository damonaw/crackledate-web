import type { HintFlowData } from './hintFlow';

export type HintRequestQuery = {
  date: string;
  mode: string;
  prefix: string;
  targetValue?: string;
};

export type HintRequestResult =
  | { kind: 'success'; hint: HintFlowData }
  | { kind: 'aborted' }
  | { kind: 'no_solution' }
  | { kind: 'rate_limited' }
  | { kind: 'temporary' };

export type HintRequestFailureKind = Exclude<HintRequestResult['kind'], 'success'>;

export type HintFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function requestHint(
  query: HintRequestQuery,
  signal: AbortSignal,
  fetcher: HintFetch = fetch,
): Promise<HintRequestResult> {
  const search = new URLSearchParams({
    date: query.date,
    mode: query.mode,
    prefix: query.prefix,
  });
  if (query.targetValue !== undefined) {
    search.set('targetValue', query.targetValue);
  }

  try {
    const response = await fetcher(`/api/hint?${search.toString()}`, { signal });
    if (signal.aborted) return { kind: 'aborted' };
    if (response.status === 404) return { kind: 'no_solution' };
    if (response.status === 429) return { kind: 'rate_limited' };
    if (!response.ok) return { kind: 'temporary' };

    const body: unknown = await response.json();
    if (signal.aborted) return { kind: 'aborted' };
    if (!isHintFlowData(body)) return { kind: 'temporary' };

    return { kind: 'success', hint: body };
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      return { kind: 'aborted' };
    }
    return { kind: 'temporary' };
  }
}

function isHintFlowData(value: unknown): value is HintFlowData {
  if (!isRecord(value)) return false;
  if (
    typeof value.solution !== 'string' ||
    typeof value.step1 !== 'string' ||
    typeof value.step2 !== 'string' ||
    typeof value.step3 !== 'string'
  ) {
    return false;
  }

  return optionalString(value, 'balancingHint') && optionalString(value, 'mathTip');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || typeof value[key] === 'string';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}
