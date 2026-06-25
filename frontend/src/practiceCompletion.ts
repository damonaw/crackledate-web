export type PracticeCompletionTarget = {
  activeView: 'game';
  selectedDate: string;
};

export function practiceCompletionTarget(todayIdentifier: string): PracticeCompletionTarget {
  return {
    activeView: 'game',
    selectedDate: todayIdentifier,
  };
}
