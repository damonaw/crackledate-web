import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { StartScreen } from './StartScreen';

describe('StartScreen', () => {
  test('renders the shared first-run entry actions', () => {
    const markup = renderToStaticMarkup(
      <StartScreen
        onPlay={() => {}}
        onHowToPlay={() => {}}
        onPractice={() => {}}
      />,
    );

    expect(markup).toContain('Crackle Date');
    expect(markup).toContain('Crack the date into equal values with Math!');
    expect(markup).toContain('Play');
    expect(markup).toContain('How to Play');
    expect(markup).toContain('Practice Round');
    expect(markup).toContain('/app-icon.png');
  });
});
