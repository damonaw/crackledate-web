import { describe, expect, test, vi } from 'vitest';
import { submitSolutionRecord } from './submissions';

describe('submitSolutionRecord', () => {
  test('posts a solved web solution to the submissions endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

    await submitSolutionRecord(
      {
        date: '2026-05-16',
        equation: '5+√16=2^0+2+6',
        seconds: 136,
        difficulty: 'hard',
        platform: 'web',
        appVersion: '0.1.0',
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-05-16',
        equation: '5+√16=2^0+2+6',
        seconds: 136,
        difficulty: 'hard',
        platform: 'web',
        appVersion: '0.1.0',
      }),
    });
  });

  test('does not throw when the best-effort submission fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      submitSolutionRecord(
        {
          date: '2026-05-16',
          equation: '5+√16=2^0+2+6',
          seconds: 136,
          difficulty: 'easy',
          platform: 'web',
        },
        fetchImpl,
      ),
    ).resolves.toBeUndefined();
  });
});
