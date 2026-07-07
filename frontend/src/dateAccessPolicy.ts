export type DateAccessDecision = { kind: 'open' };

export function dateAccessDecisionFor({
  selectedDate: _selectedDate,
  today: _today,
}: {
  selectedDate: string;
  today: string;
}): DateAccessDecision {
  return { kind: 'open' };
}
