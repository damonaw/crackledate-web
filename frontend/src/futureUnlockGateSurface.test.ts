import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('future unlock gate surface', () => {
  test('future dates do not use sponsor gates or ad countdowns', () => {
    expect(source).not.toContain('Unlock Future Date');
    expect(source).not.toContain('Watch a {adDurationSeconds}-second sponsor message to play this date early.');
    expect(source).not.toContain("claimLabel === 'Play Date'");
    expect(source).not.toContain("claimLabel === 'Play Tomorrow'");
    expect(source).not.toContain('dateAfterCancelingFutureGate');
    expect(source).toContain("setActiveView('game');");
  });
});
