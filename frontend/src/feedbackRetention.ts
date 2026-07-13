export function feedbackMessageAfterPuzzleLoad(
  currentMessage: string,
  preserveCurrentMessage: boolean,
  protectedMessage = '',
): string {
  return preserveCurrentMessage || currentMessage === protectedMessage
    ? currentMessage
    : '';
}
