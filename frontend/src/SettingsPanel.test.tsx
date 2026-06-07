import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  test('renders an Ouroborialis footer at the bottom of settings', () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        themePreference="system"
        difficultyMode="easy"
        onThemePreferenceChange={() => {}}
        onDifficultyModeChange={() => {}}
        onClearData={() => {}}
        onShowHowToPlay={() => {}}
      />,
    );

    expect(markup).toContain('How to Play');
    expect(markup).toContain('settings-link-button');
    expect(markup).toContain('An Ouroborialis Game');
    expect(markup).toContain('settings-branding-mark');
    expect(markup).toContain('settings-branding-copy');
    expect(markup).toContain('src="/ouroborialis-logo.png"');
    expect(markup).toContain('settings-branding-logo"');
    expect(markup).toContain('alt=""');
  });
});
