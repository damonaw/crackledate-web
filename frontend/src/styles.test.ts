// @ts-expect-error The app tsconfig intentionally excludes Node types, but this test reads a local fixture.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? '';
}

describe('stylesheet regressions', () => {
  test('does not draw an outer selection box around selected fractions', () => {
    const selectedFractionDeclarations = declarationsFor(
      '.equation-source-fraction-selected.equation-source-fraction-token',
    );

    expect(selectedFractionDeclarations).not.toMatch(/\bborder(?:-radius|-color)?\s*:/);
    expect(selectedFractionDeclarations).not.toMatch(/\bbackground\s*:/);
    expect(selectedFractionDeclarations).not.toMatch(/\bbox-shadow\s*:/);
  });

  test('keeps selected fraction parts spaced away from the divider', () => {
    expect(styles).toContain('height: 88px;');
    expect(styles).toContain('transform: translateY(0.16em);');
    expect(styles).toContain('transform: translateY(-0.16em);');
    expect(styles.indexOf('transform: translateY(0.16em);')).toBeLessThan(
      styles.indexOf('transform: translateY(-0.16em);'),
    );
  });
});
