import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('privacy disclosure', () => {
  test('covers live evaluation, hints, submissions, and operational data', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).toContain('While you play');
    expect(appSource).toContain('puzzle date and current equation');
    expect(appSource).toContain('Hints send the puzzle date, mode, equation prefix, and target value when relevant.');
    expect(appSource).toContain('Correct non-Practice solutions send the puzzle date, equation, solve time, difficulty mode, platform, and app version.');
    expect(appSource).toContain('network-derived hashes');
    expect(appSource).toContain('Last updated July 14, 2026');
  });
});
