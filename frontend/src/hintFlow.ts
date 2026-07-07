export type HintFlowData = {
  solution: string;
  step1: string;
  step2: string;
  step3?: string;
  balancingHint?: string;
  mathTip?: string;
};

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
