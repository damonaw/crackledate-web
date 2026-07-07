import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('web share surface', () => {
  test('uses browser share with clipboard fallback for dashboard and saved solution sharing', () => {
    const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(mainSource).toContain('shareTextWithBrowser(');
    expect(mainSource).toContain('navigator.share');
    expect(mainSource).toContain('navigator.clipboard.writeText');
    expect(mainSource).toContain("setMessage('Shared!')");
    expect(mainSource).toContain("setMessage('Copied to clipboard!')");
  });
});
