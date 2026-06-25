import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { EquationEmptyState } from './EquationEmptyState';

describe('EquationEmptyState', () => {
  test('renders a prompt with instructions and practice actions', () => {
    const markup = renderToStaticMarkup(
      <EquationEmptyState
        onShowDetailedInstructions={() => {}}
        onStartPractice={() => {}}
      />,
    );

    expect(markup).toContain('Not sure where to start?');
    expect(markup).toContain('Instructions');
    expect(markup).toContain('Practice Round');
    expect(markup).toContain('equation-empty-actions');
    expect(markup).toContain('equation-empty-help-button');
    expect(markup).toContain('equation-empty-practice-button');
    expect(markup).toContain('equation-empty-prompt');
    expect(markup).not.toContain('equation-selection-cue');
  });
});
