import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  test('renders settings controls and help links', () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        themePreference="system"
        difficultyMode="easy"
        gameMode="classic"
        onThemePreferenceChange={() => {}}
        onDifficultyModeChange={() => {}}
        onGameModeChange={() => {}}
        onClearData={() => {}}
        onShowHowToPlay={() => {}}
      />,
    );

    expect(markup).toContain('Saved on this browser');
    expect(markup).toContain('Appearance');
    expect(markup).toContain('Difficulty');
    expect(markup).toContain('How to Play');
    expect(markup).toContain('Practice');
    expect(markup).toContain('Rules');
    expect(markup).toContain('Restart Practice Round');
    expect(markup).toContain('Privacy');
    expect(markup).toContain('Support');
    expect(markup).toContain('Clear Data');
    expect(markup).toContain('settings-link-button');
  });

  test('uses an in-app clear data confirmation modal instead of a browser confirm', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).not.toContain('window.confirm');
    expect(appSource).toContain('clearDataConfirmVisible');
    expect(appSource).toContain('ClearDataConfirmModal');
    expect(appSource).toContain('Clear Data?');
    expect(appSource).toContain('This permanently deletes saved solutions, stats, and Crackle Date settings in this browser.');
  });
});
