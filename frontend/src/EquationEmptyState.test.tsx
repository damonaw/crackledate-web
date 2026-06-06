import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { EquationEmptyState } from './EquationEmptyState';

describe('EquationEmptyState', () => {
  test('renders centered prompt text without an empty selection cue', () => {
    const markup = renderToStaticMarkup(<EquationEmptyState />);

    expect(markup).toContain('Start building your Crackle Date with the numbers and math operators');
    expect(markup).toContain('equation-empty-prompt');
    expect(markup).not.toContain('equation-selection-cue');
  });
});
