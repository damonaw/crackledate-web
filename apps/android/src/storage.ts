import type { SolutionSubmission, SubmissionDifficulty } from '@crackledate/core';

export type LocalSolution = {
  id: number;
  date: string;
  equation: string;
  value: string;
  seconds: number;
  difficulty: SubmissionDifficulty;
  solvedAt: string;
};

export type SaveSolvedPuzzleInput = {
  date: string;
  equation: string;
  value: string;
  seconds: number;
  difficulty: SubmissionDifficulty;
  appVersion?: string;
  solvedAt: string;
};

export type QueuedSubmission = {
  id: number;
  payload: SolutionSubmission;
  attempts: number;
  lastAttemptAt?: string | null;
};

export type StorageDriver = {
  initialize(): Promise<void>;
  insertSolution(solution: Omit<LocalSolution, 'id'>): Promise<LocalSolution>;
  allSolutions(): Promise<LocalSolution[]>;
  solutionsForDate(date: string): Promise<LocalSolution[]>;
  setSetting(key: string, value: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  enqueueSubmission(payload: SolutionSubmission): Promise<QueuedSubmission>;
  pendingSubmissions(): Promise<QueuedSubmission[]>;
  deleteSubmission(id: number): Promise<void>;
  markSubmissionAttempt(id: number, attemptedAt: string): Promise<void>;
  resetAll(): Promise<void>;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
}>;

export const defaultSubmissionsEndpoint = 'https://crackledate.com/api/submissions';

export class CrackleDateRepository {
  constructor(private readonly driver: StorageDriver) {}

  initialize(): Promise<void> {
    return this.driver.initialize();
  }

  async saveSolvedPuzzle(input: SaveSolvedPuzzleInput): Promise<LocalSolution> {
    const solution = await this.driver.insertSolution({
      date: input.date,
      equation: input.equation,
      value: input.value,
      seconds: input.seconds,
      difficulty: input.difficulty,
      solvedAt: input.solvedAt,
    });

    await this.driver.enqueueSubmission({
      date: input.date,
      equation: input.equation,
      seconds: input.seconds,
      difficulty: input.difficulty,
      platform: 'android',
      appVersion: input.appVersion,
    });

    return solution;
  }

  allSolutions(): Promise<LocalSolution[]> {
    return this.driver.allSolutions();
  }

  solutionsForDate(date: string): Promise<LocalSolution[]> {
    return this.driver.solutionsForDate(date);
  }

  setSetting(key: string, value: string): Promise<void> {
    return this.driver.setSetting(key, value);
  }

  getSetting(key: string): Promise<string | null> {
    return this.driver.getSetting(key);
  }

  pendingSubmissions(): Promise<QueuedSubmission[]> {
    return this.driver.pendingSubmissions();
  }

  deleteSubmission(id: number): Promise<void> {
    return this.driver.deleteSubmission(id);
  }

  markSubmissionAttempt(id: number, attemptedAt: string): Promise<void> {
    return this.driver.markSubmissionAttempt(id, attemptedAt);
  }

  resetAll(): Promise<void> {
    return this.driver.resetAll();
  }
}

export async function flushSubmissionQueue(
  repository: Pick<CrackleDateRepository, 'pendingSubmissions' | 'deleteSubmission' | 'markSubmissionAttempt'>,
  fetchImpl: FetchLike = fetch,
  endpoint = defaultSubmissionsEndpoint,
): Promise<void> {
  const queued = await repository.pendingSubmissions();

  for (const item of queued) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.payload),
    });

    if (response.ok) {
      await repository.deleteSubmission(item.id);
    } else {
      await repository.markSubmissionAttempt(item.id, new Date().toISOString());
    }
  }
}

export function createInMemoryDatabase(): StorageDriver {
  let nextSolutionId = 1;
  let nextSubmissionId = 1;
  let solutions: LocalSolution[] = [];
  let settings = new Map<string, string>();
  let submissions: QueuedSubmission[] = [];

  return {
    async initialize() {},
    async insertSolution(solution) {
      const saved = { ...solution, id: nextSolutionId };
      nextSolutionId += 1;
      solutions.push(saved);
      return saved;
    },
    async allSolutions() {
      return [...solutions].sort((left, right) => right.solvedAt.localeCompare(left.solvedAt));
    },
    async solutionsForDate(date) {
      return solutions.filter((solution) => solution.date === date);
    },
    async setSetting(key, value) {
      settings.set(key, value);
    },
    async getSetting(key) {
      return settings.get(key) ?? null;
    },
    async enqueueSubmission(payload) {
      const queued = { id: nextSubmissionId, payload, attempts: 0, lastAttemptAt: null };
      nextSubmissionId += 1;
      submissions.push(queued);
      return queued;
    },
    async pendingSubmissions() {
      return [...submissions].sort((left, right) => left.id - right.id);
    },
    async deleteSubmission(id) {
      submissions = submissions.filter((submission) => submission.id !== id);
    },
    async markSubmissionAttempt(id, attemptedAt) {
      submissions = submissions.map((submission) =>
        submission.id === id
          ? { ...submission, attempts: submission.attempts + 1, lastAttemptAt: attemptedAt }
          : submission,
      );
    },
    async resetAll() {
      solutions = [];
      settings = new Map();
      submissions = [];
      nextSolutionId = 1;
      nextSubmissionId = 1;
    },
  };
}
