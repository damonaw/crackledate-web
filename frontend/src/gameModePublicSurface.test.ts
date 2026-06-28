import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('public game mode surface', () => {
  test('boots the web app in canonical classic mode even if old mode values exist', () => {
    const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(mainSource).toContain("const canonicalPublicGameMode = 'classic'");
    expect(mainSource).toContain('function loadGameMode(): GameMode');
    expect(mainSource).toContain('return canonicalPublicGameMode');
  });
});
