export type SolutionSubmission = {
  date: string;
  equation: string;
  seconds: number;
  difficulty: 'easy' | 'hard';
  platform: 'web';
  appVersion?: string;
  clientRejectionReason?: string;
};

type FetchFunction = typeof fetch;

export const webAppVersion = '0.1.0';

export async function submitSolutionRecord(
  submission: SolutionSubmission,
  fetchImpl: FetchFunction = fetch,
): Promise<void> {
  try {
    await fetchImpl('/api/submissions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
  } catch {
    // Remote collection is best-effort; a network issue must not block local solving.
  }
}
