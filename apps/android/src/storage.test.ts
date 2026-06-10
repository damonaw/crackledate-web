import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createInMemoryDatabase, CrackleDateRepository, flushSubmissionQueue } from './storage';

describe('CrackleDateRepository', () => {
  let repository: CrackleDateRepository;

  beforeEach(async () => {
    repository = new CrackleDateRepository(createInMemoryDatabase());
    await repository.initialize();
  });

  test('saves a solution locally and enqueues an android submission', async () => {
    await repository.saveSolvedPuzzle({
      date: '2026-05-16',
      equation: '5+√16=2^0+2+6',
      value: '9',
      seconds: 136,
      difficulty: 'hard',
      appVersion: '1.0.0',
      solvedAt: '2026-05-16T12:00:00Z',
    });

    await expect(repository.solutionsForDate('2026-05-16')).resolves.toEqual([
      {
        id: 1,
        date: '2026-05-16',
        equation: '5+√16=2^0+2+6',
        value: '9',
        seconds: 136,
        difficulty: 'hard',
        solvedAt: '2026-05-16T12:00:00Z',
      },
    ]);
    await expect(repository.pendingSubmissions()).resolves.toMatchObject([
      {
        id: 1,
        payload: {
          date: '2026-05-16',
          equation: '5+√16=2^0+2+6',
          seconds: 136,
          difficulty: 'hard',
          platform: 'android',
          appVersion: '1.0.0',
        },
        attempts: 0,
      },
    ]);
  });

  test('flushes successful queued submissions and retains failures with attempts', async () => {
    await repository.saveSolvedPuzzle({
      date: '2026-05-16',
      equation: '5+√16=2^0+2+6',
      value: '9',
      seconds: 136,
      difficulty: 'easy',
      appVersion: '1.0.0',
      solvedAt: '2026-05-16T12:00:00Z',
    });

    const failedFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await flushSubmissionQueue(repository, failedFetch);
    expect((await repository.pendingSubmissions())[0].attempts).toBe(1);

    const successfulFetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    await flushSubmissionQueue(repository, successfulFetch);

    await expect(repository.pendingSubmissions()).resolves.toEqual([]);
    expect(successfulFetch).toHaveBeenCalledWith(
      'https://crackledate.com/api/submissions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  test('reset clears solutions, settings, stats, and queue', async () => {
    await repository.setSetting('difficulty', 'hard');
    await repository.saveSolvedPuzzle({
      date: '2026-05-16',
      equation: '5+√16=2^0+2+6',
      value: '9',
      seconds: 136,
      difficulty: 'hard',
      appVersion: '1.0.0',
      solvedAt: '2026-05-16T12:00:00Z',
    });

    await repository.resetAll();

    await expect(repository.allSolutions()).resolves.toEqual([]);
    await expect(repository.pendingSubmissions()).resolves.toEqual([]);
    await expect(repository.getSetting('difficulty')).resolves.toBeNull();
  });
});
