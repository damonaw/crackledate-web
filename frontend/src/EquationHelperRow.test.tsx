import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { EquationHelperRow } from './EquationHelperRow';

describe('EquationHelperRow', () => {
  test('keeps selector arrows visible when helper values are hidden', () => {
    const markup = renderToStaticMarkup(
      <EquationHelperRow
        showHelperValues={false}
        leftValue="?"
        rightValue="?"
        onMove={() => {}}
      />,
    );

    expect(markup).toContain('helper-row selector-only');
    expect(markup).toContain('aria-label="Move selector left"');
    expect(markup).toContain('aria-label="Move selector right"');
    expect(markup).not.toContain('helper-label');
  });
});
