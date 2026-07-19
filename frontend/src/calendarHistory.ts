export function averageTimeForSolutions(
  solutions: readonly { seconds: number }[],
): number | null {
  const durations = solutions
    .map(({ seconds }) => seconds)
    .filter((seconds) => seconds > 0);
  if (durations.length === 0) return null;
  return Math.round(
    durations.reduce((total, seconds) => total + seconds, 0) / durations.length,
  );
}
