import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: {
    create: <T>(styles: T) => styles,
  },
  Text: 'Text',
  View: 'View',
}));

import { selectionMatchesLatexSlot } from './native-latex';
import { styles } from './ui';

describe('NativeLatexEquation layout', () => {
  test('keeps math-adjacent slots and postfix operators visually tight', () => {
    expect(styles.latexSlot.minWidth).toBeLessThanOrEqual(3);
    expect(styles.selectedLatexSlot.minWidth).toBeGreaterThanOrEqual(10);
    expect(styles.latexPostfixOperatorToken.minWidth).toBeLessThanOrEqual(14);
    expect(styles.latexPowerOperatorTouch.minWidth).toBeLessThanOrEqual(6);
  });

  test('matches fraction placement slots separately from whole-expression slots', () => {
    expect(selectionMatchesLatexSlot({ kind: 'slot', index: 0 }, 0)).toBe(true);
    expect(selectionMatchesLatexSlot({ kind: 'slot', index: 0 }, 0, 'fractionNumeratorStart')).toBe(false);
    expect(
      selectionMatchesLatexSlot(
        { kind: 'slot', index: 0, placement: 'fractionNumeratorStart' },
        0,
        'fractionNumeratorStart',
      ),
    ).toBe(true);
    expect(
      selectionMatchesLatexSlot(
        { kind: 'slot', index: 3, placement: 'fractionDenominatorEnd' },
        3,
        'fractionDenominatorEnd',
      ),
    ).toBe(true);
  });
});
