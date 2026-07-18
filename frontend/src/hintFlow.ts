import {
  sameHintRequestIdentity,
  type HintRequestIdentity,
} from './hintRequestCoordinator';
import type { EditorSelection } from './equationEditing';

export type HintFlowData = {
  solution: string;
  step1: string;
  step2: string;
  step3: string;
  balancingHint?: string;
  mathTip?: string;
};

export const hintNoSolutionMessage = 'No hint available yet';
export const hintRateLimitedMessage =
  'Too many hint requests at once. Please wait a moment and try again.';
export const hintTemporaryMessage = 'No hint available yet';

export type HintFailureKind =
  | 'aborted'
  | 'no_solution'
  | 'rate_limited'
  | 'temporary';

export type HintFailureFeedback = {
  message: string;
  isDeadEnd: boolean;
};

export type IdentifiedHintData = {
  identity: HintRequestIdentity;
  hint: HintFlowData;
};

export type HintClickAction = 'request' | 'advance';

type ComparableEditorState<T> = {
  tokens: readonly T[];
  selection: EditorSelection;
};

export function editorStatesEqual<T>(
  current: ComparableEditorState<T>,
  next: ComparableEditorState<T>,
): boolean {
  if (current.tokens.length !== next.tokens.length) return false;
  if (!current.tokens.every((token, index) => Object.is(token, next.tokens[index]))) {
    return false;
  }
  if (
    current.selection.kind !== next.selection.kind ||
    current.selection.index !== next.selection.index
  ) {
    return false;
  }

  if (current.selection.kind === 'slot' && next.selection.kind === 'slot') {
    return current.selection.placement === next.selection.placement;
  }

  return true;
}

export function bindHintDataToIdentity(
  identity: HintRequestIdentity,
  hint: HintFlowData,
): IdentifiedHintData {
  return { identity, hint };
}

export function hintDataForIdentity(
  identifiedHint: IdentifiedHintData | null,
  currentIdentity: HintRequestIdentity,
): HintFlowData | null {
  if (!identifiedHint) return null;
  return sameHintRequestIdentity(identifiedHint.identity, currentIdentity)
    ? identifiedHint.hint
    : null;
}

export function hintClickAction({
  hintOpen,
  currentHintData,
}: {
  hintOpen: boolean;
  currentHintData: HintFlowData | null;
}): HintClickAction {
  return hintOpen && currentHintData ? 'advance' : 'request';
}

export function hintFailureFeedback(
  kind: HintFailureKind,
  equation: string,
): HintFailureFeedback | null {
  if (kind === 'aborted') return null;
  if (kind === 'rate_limited') {
    return { message: hintRateLimitedMessage, isDeadEnd: false };
  }
  if (kind === 'temporary') {
    return { message: hintTemporaryMessage, isDeadEnd: false };
  }
  if (equation.trim().length === 0) {
    return {
      message: 'Could not find any solutions for this puzzle.',
      isDeadEnd: false,
    };
  }
  return { message: hintNoSolutionMessage, isDeadEnd: true };
}

export function nextVisibleHintStep({
  requestedStep,
  currentHintStep,
}: {
  requestedStep: number;
  currentHintStep: number;
}): 1 | 2 | 3 {
  const boundedStep = Math.min(Math.max(requestedStep, 1), 3);

  if (currentHintStep <= 0) {
    return 1;
  }

  if (boundedStep >= 3) {
    return currentHintStep >= 2 ? 3 : 2;
  }

  return boundedStep === 1 ? 1 : 2;
}
