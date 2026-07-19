import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('privacy disclosure', () => {
  test('states the local-only and stateless product contract', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).toContain('Saved equations, solve times, streaks, settings, theme, difficulty, and onboarding progress stay in this browser.');
    expect(appSource).toContain('The web service processes puzzle, equation, validation, and hint requests only long enough to respond and does not retain gameplay content.');
    expect(appSource).toContain('Operational logs contain only timestamp, level, method, path, status, and duration; they do not contain gameplay content or a client identifier.');
    expect(appSource).toContain('Crackle Date has no ads, purchases, accounts, tracking, public profiles, or cloud gameplay history.');
    expect(appSource).toContain('Last updated July 18, 2026');
    expect(appSource).not.toContain('network-derived hashes');
    expect(appSource).not.toContain('Correct non-Practice solutions send');
  });

  test('explains that missing browser history cannot be restored', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('Clearing browser data, using private browsing, switching browsers, or changing devices can remove local history. Crackle Date does not keep a server copy and cannot restore it.');
  });
});
