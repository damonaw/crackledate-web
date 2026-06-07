import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { EquationEmptyState } from './EquationEmptyState';

describe('EquationEmptyState', () => {
  test('renders a prompt with cracked instructions action', () => {
    const markup = renderToStaticMarkup(<EquationEmptyState onShowDetailedInstructions={() => {}} />);

    expect(markup).toContain('Not sure where to start, get some');
    expect(markup).toContain('cracked instructions');
    expect(markup).toContain('equation-empty-help-button');
    expect(markup).toContain('equation-empty-prompt');
    expect(markup).not.toContain('equation-selection-cue');
  });
});
