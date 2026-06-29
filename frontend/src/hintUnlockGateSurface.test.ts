import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('hint unlock gate surface', () => {
  test('uses a focused full-solution sponsor gate instead of the broad support portal', () => {
    expect(source).toContain("const isHintUnlock = actionName === 'reveal a full solution' && claimLabel === 'Unlock Clue'");
    expect(source).toContain("isHintUnlock ? 'Unlock Full Solution'");
    expect(source).toContain('Watch a {adDurationSeconds}-second sponsor message to reveal a full solution.');
    expect(source).toContain('Sponsor Playing');
    expect(source).toContain('Keep Playing');
    expect(source).toContain("!isHintUnlock && !isFutureUnlock && status === 'ready'");
    expect(styles).toContain('.hint-unlock-content');
    expect(styles).toContain('.hint-unlock-primary:disabled');
  });
});
