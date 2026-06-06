export type FeedbackToken = {
  value: string;
};

export function shouldSurfaceEvaluationError(
  _tokens: readonly FeedbackToken[],
  _nextDigitIndex: number | null,
  _errorMessage: string,
): boolean {
  return false;
}
