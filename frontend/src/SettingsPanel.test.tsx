import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  test('renders help links and removes the Ouroborialis footer from settings', () => {
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
        onSupport={() => {}}
      />,
    );

    expect(markup).toContain('How to Play');
    expect(markup).toContain('Practice');
    expect(markup).toContain('Rules');
    expect(markup).toContain('Restart Practice Round');
    expect(markup).toContain('settings-link-button');
    expect(markup).toContain('$1.99');
    expect(markup).toContain('removes date-based sponsor ads');
    expect(markup).toContain('Support for $1.99');
    expect(markup).toContain('settings-support-action');
    expect(markup).not.toContain('Game Mode');
    expect(markup).not.toContain('Double =');
    expect(markup).not.toContain('Single');
    expect(markup).not.toContain('An Ouroborialis Game');
    expect(markup).not.toContain('settings-branding-mark');
    expect(markup).not.toContain('src="/ouroborialis-logo.png"');
    expect(markup).not.toContain('Ad-Free');
  });

  test('does not show the supporter purchase action when already supported', () => {
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
        onSupport={() => {}}
        isSupporter={true}
      />,
    );

    expect(markup).toContain('Supporter ads are removed on this browser.');
    expect(markup).not.toContain('Support for $1.99');
    expect(markup).not.toContain('settings-support-action');
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
