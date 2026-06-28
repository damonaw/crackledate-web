export type InitialActiveView = 'start' | 'game';

export function initialActiveView({
  playStarted,
  guidedFirstWinCompleted,
}: {
  playStarted: boolean;
  guidedFirstWinCompleted: boolean;
}): InitialActiveView {
  return playStarted || guidedFirstWinCompleted ? 'game' : 'start';
}
