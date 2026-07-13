import type { HintRequestResult } from './hintRequest';

export type HintRequestIdentity = {
  activeView: string;
  puzzleDate: string;
  playMode: 'daily' | 'practice';
  equation: string;
};

export type HintRequestTrigger = 'explicit' | 'reactive';

export type HintRequestLifecycle = {
  identity: HintRequestIdentity;
  trigger: HintRequestTrigger;
  generation: number;
};

export type HintRequestCompletion = HintRequestLifecycle & {
  result: HintRequestResult;
};

type HintRequestCoordinatorOptions = {
  request: (
    identity: HintRequestIdentity,
    signal: AbortSignal,
  ) => Promise<HintRequestResult>;
  onResult: (completion: HintRequestCompletion) => void;
  onStart?: (request: HintRequestLifecycle) => void;
  onFinish?: (request: HintRequestLifecycle) => void;
  debounceMs?: number;
};

type ActiveRequest = HintRequestLifecycle & {
  key: string;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
  started: boolean;
};

export class HintRequestCoordinator {
  private readonly request: HintRequestCoordinatorOptions['request'];
  private readonly onResult: HintRequestCoordinatorOptions['onResult'];
  private readonly onStart?: HintRequestCoordinatorOptions['onStart'];
  private readonly onFinish?: HintRequestCoordinatorOptions['onFinish'];
  private readonly debounceMs: number;
  private generation = 0;
  private active: ActiveRequest | null = null;
  private lastStartedKey: string | null = null;

  constructor({
    request,
    onResult,
    onStart,
    onFinish,
    debounceMs = 300,
  }: HintRequestCoordinatorOptions) {
    this.request = request;
    this.onResult = onResult;
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.debounceMs = debounceMs;
  }

  requestExplicit(identity: HintRequestIdentity): void {
    const key = identityKey(identity);
    if (this.active?.key === key) {
      if (this.active.started) return;
      if (this.active.timer !== null) {
        clearTimeout(this.active.timer);
        this.active.timer = null;
      }
      this.active.trigger = 'explicit';
      this.start(this.active);
      return;
    }

    this.cancelActive();
    this.start(this.createActive(identity, key, 'explicit'));
  }

  requestReactive(identity: HintRequestIdentity): void {
    const key = identityKey(identity);
    if (this.active?.key === key || this.lastStartedKey === key) return;

    this.cancelActive();
    const active = this.createActive(identity, key, 'reactive');
    this.active = active;
    active.timer = setTimeout(() => {
      active.timer = null;
      this.start(active);
    }, this.debounceMs);
  }

  invalidate(): void {
    this.generation += 1;
    this.cancelActive();
    this.lastStartedKey = null;
  }

  private createActive(
    identity: HintRequestIdentity,
    key: string,
    trigger: HintRequestTrigger,
  ): ActiveRequest {
    return {
      identity,
      key,
      trigger,
      generation: ++this.generation,
      controller: null,
      timer: null,
      started: false,
    };
  }

  private start(active: ActiveRequest): void {
    if (this.active !== null && this.active !== active) return;
    this.active = active;
    active.started = true;
    active.controller = new AbortController();
    this.lastStartedKey = active.key;
    this.onStart?.(lifecycle(active));

    let resultPromise: Promise<HintRequestResult>;
    try {
      resultPromise = this.request(active.identity, active.controller.signal);
    } catch {
      resultPromise = Promise.resolve({ kind: 'temporary' });
    }

    void resultPromise
      .catch<HintRequestResult>(() => (
        active.controller?.signal.aborted
          ? { kind: 'aborted' }
          : { kind: 'temporary' }
      ))
      .then((result) => this.complete(active, result));
  }

  private complete(active: ActiveRequest, result: HintRequestResult): void {
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
    if (active.timer !== null) clearTimeout(active.timer);
    active.controller?.abort();
    if (active.started) this.onFinish?.(lifecycle(active));
  }
}

export function sameHintRequestIdentity(
  left: HintRequestIdentity,
  right: HintRequestIdentity,
): boolean {
  return (
    left.activeView === right.activeView &&
    left.puzzleDate === right.puzzleDate &&
    left.playMode === right.playMode &&
    left.equation === right.equation
  );
}

function identityKey(identity: HintRequestIdentity): string {
  return JSON.stringify([
    identity.activeView,
    identity.puzzleDate,
    identity.playMode,
    identity.equation,
  ]);
}

function lifecycle(active: ActiveRequest): HintRequestLifecycle {
  return {
    identity: active.identity,
    trigger: active.trigger,
    generation: active.generation,
  };
}
