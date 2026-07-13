import type { ValidationRequestResult } from './validationRequest';

export type ValidationRequestIdentity = {
  activeView: string;
  puzzleDate: string;
  playMode: 'daily' | 'practice';
  equation: string;
  onboardingPhase: string;
  onboardingGeneration: number;
};

export type ValidationRequestLifecycle = {
  identity: ValidationRequestIdentity;
  generation: number;
};

export type ValidationRequestCompletion = ValidationRequestLifecycle & {
  result: ValidationRequestResult;
};

type ValidationRequestCoordinatorOptions = {
  request: (
    identity: ValidationRequestIdentity,
    signal: AbortSignal,
  ) => Promise<ValidationRequestResult>;
  onResult: (completion: ValidationRequestCompletion) => void;
  onStart?: (request: ValidationRequestLifecycle) => void;
  onFinish?: (request: ValidationRequestLifecycle) => void;
};

type ActiveRequest = ValidationRequestLifecycle & {
  key: string;
  controller: AbortController;
};

export class ValidationRequestCoordinator {
  private readonly request: ValidationRequestCoordinatorOptions['request'];
  private readonly onResult: ValidationRequestCoordinatorOptions['onResult'];
  private readonly onStart?: ValidationRequestCoordinatorOptions['onStart'];
  private readonly onFinish?: ValidationRequestCoordinatorOptions['onFinish'];
  private generation = 0;
  private active: ActiveRequest | null = null;

  constructor({
    request,
    onResult,
    onStart,
    onFinish,
  }: ValidationRequestCoordinatorOptions) {
    this.request = request;
    this.onResult = onResult;
    this.onStart = onStart;
    this.onFinish = onFinish;
  }

  submit(identity: ValidationRequestIdentity): void {
    const key = identityKey(identity);
    if (this.active?.key === key) return;

    this.cancelActive();
    const active: ActiveRequest = {
      identity,
      key,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = active;
    this.onStart?.(lifecycle(active));

    let resultPromise: Promise<ValidationRequestResult>;
    try {
      resultPromise = this.request(identity, active.controller.signal);
    } catch {
      resultPromise = Promise.resolve({ kind: 'temporary' });
    }

    void resultPromise
      .catch<ValidationRequestResult>(() => (
        active.controller.signal.aborted
          ? { kind: 'aborted' }
          : { kind: 'temporary' }
      ))
      .then((result) => this.complete(active, result));
  }

  invalidate(): void {
    this.generation += 1;
    this.cancelActive();
  }

  private complete(active: ActiveRequest, result: ValidationRequestResult): void {
    if (this.active !== active || active.generation !== this.generation) return;
    this.active = null;

    try {
      if (result.kind !== 'aborted') {
        this.onResult({ ...lifecycle(active), result });
      }
    } finally {
      this.onFinish?.(lifecycle(active));
    }
  }

  private cancelActive(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.controller.abort();
    this.onFinish?.(lifecycle(active));
  }
}

export function sameValidationRequestIdentity(
  left: ValidationRequestIdentity,
  right: ValidationRequestIdentity,
): boolean {
  return left.activeView === right.activeView &&
    left.puzzleDate === right.puzzleDate &&
    left.playMode === right.playMode &&
    left.equation === right.equation &&
    left.onboardingPhase === right.onboardingPhase &&
    left.onboardingGeneration === right.onboardingGeneration;
}

function identityKey(identity: ValidationRequestIdentity): string {
  return JSON.stringify([
    identity.activeView,
    identity.puzzleDate,
    identity.playMode,
    identity.equation,
    identity.onboardingPhase,
    identity.onboardingGeneration,
  ]);
}

function lifecycle(active: ActiveRequest): ValidationRequestLifecycle {
  return {
    identity: active.identity,
    generation: active.generation,
  };
}
