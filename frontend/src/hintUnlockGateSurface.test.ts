import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
describe('hint unlock gate surface', () => {
  test('full-solution hints do not use sponsor gates or ad countdowns', () => {
    expect(source).not.toContain('Unlock Full Solution');
    expect(source).not.toContain('Watch a {adDurationSeconds}-second sponsor message to reveal a full solution.');
    expect(source).not.toContain('Sponsor Playing');
    expect(source).not.toContain("actionName === 'reveal a full solution'");
    expect(source).not.toContain("claimLabel === 'Unlock Clue'");
  });
});
