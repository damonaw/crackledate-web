import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('future unlock gate surface', () => {
  test('uses a focused future-date sponsor gate instead of the broad support portal', () => {
    expect(source).toContain("const isFutureUnlock = claimLabel === 'Play Date' || claimLabel === 'Play Tomorrow'");
    expect(source).toContain("isFutureUnlock ? 'Unlock Future Date'");
    expect(source).toContain('Watch a {adDurationSeconds}-second sponsor message to play this date early.');
    expect(source).toContain("!isHintUnlock && !isFutureUnlock && status === 'ready'");
    expect(source).toContain("!isHintUnlock && !isFutureUnlock && status === 'playing'");
    expect(source).toContain("!isHintUnlock && !isFutureUnlock && status === 'completed'");
    expect(source).toContain('Back to Today');
  });

  test('canceling the future gate returns to today on the game surface', () => {
    expect(source).toContain('setSelectedDate(dateAfterCancelingFutureGate(todayId));');
    expect(source).toContain("setActiveView('game');");
  });
});
