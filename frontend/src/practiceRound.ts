export const practiceRound = {
  dateIdentifier: '2026-06-19',
  formattedDate: '6-19-2026',
  displayDate: 'June 19, 2026',
  digits: [6, 1, 9, 2, 0, 2, 6],
  title: 'Practice Round',
  coach: 'Follow the highlighted steps. Practice does not affect your daily streak or saved solutions.',
} as const;

export function practiceSuccessMessage(value: string): string {
  const displayValue = value.trim() || '?';
  return `Practice solved. Both sides equal ${displayValue}.`;
}
