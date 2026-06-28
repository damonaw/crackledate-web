export function feedbackMessageAfterPuzzleLoad(
  currentMessage: string,
  preserveCurrentMessage: boolean,
): string {
  return preserveCurrentMessage ? currentMessage : '';
}
