import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { EquationSelectorControls } from './EquationSelectorControls';

describe('EquationSelectorControls', () => {
  test('renders left and right selector arrow buttons', () => {
    const markup = renderToStaticMarkup(
      <EquationSelectorControls onMove={() => {}} />,
    );

    expect(markup).toContain('selector-arrow-controls');
    expect(markup).toContain('selector-arrow-button');
    expect(markup).toContain('aria-label="Move selector left"');
    expect(markup).toContain('aria-label="Move selector right"');
    expect(markup).toContain('type="button"');
  });
});
