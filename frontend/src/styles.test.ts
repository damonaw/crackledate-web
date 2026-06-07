import { describe, expect, test } from 'vitest';
import styles from './styles.css?raw';

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
});
