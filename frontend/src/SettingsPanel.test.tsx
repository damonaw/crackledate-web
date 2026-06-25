import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
      />,
    );

    expect(markup).toContain('How to Play');
    expect(markup).toContain('Practice');
    expect(markup).toContain('Rules');
    expect(markup).toContain('Restart Guided First Crack');
    expect(markup).toContain('settings-link-button');
    expect(markup).toContain('$1.99');
    expect(markup).toContain('does not remove date-based sponsor ads');
    expect(markup).toContain('Future dates can ask for a 30-second sponsor ad.');
    expect(markup).toContain('Past dates and extra current-date solves can show a banner ad.');
    expect(markup).not.toContain('An Ouroborialis Game');
    expect(markup).not.toContain('settings-branding-mark');
    expect(markup).not.toContain('src="/ouroborialis-logo.png"');
    expect(markup).not.toContain('Ad-Free');
  });
});
