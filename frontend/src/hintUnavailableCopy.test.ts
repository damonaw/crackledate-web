import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('hint unavailable feedback', () => {
  test('keeps the recoverable dead-end copy aligned across native clients', () => {
    expect(source).toContain(
      "? 'Could not quickly find a solution with what is currently entered. Try backspacing or clearing.'",
    );
    expect(source).toContain(
      ": 'Could not quickly find a solution to balance the sides with what is currently entered. Try backspacing or clearing.'",
    );
  });
});
