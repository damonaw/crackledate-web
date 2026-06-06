import { describe, expect, test } from 'vitest';
import {
  deleteAtSelection,
  insertTokensAtSelection,
  moveSelectionHorizontally,
  type EditorSelection,
} from './equationEditing';

type Token = {
  value: string;
  role?: 'absoluteOpen' | 'absoluteClose';
  digitIndex?: number;
};

const token = (value: string, extra: Omit<Token, 'value'> = {}): Token => ({ value, ...extra });

describe('equation editing selection', () => {
  test('replaces a selected token with a new operator token', () => {
    const selection: EditorSelection = { kind: 'token', index: 1 };
    const result = insertTokensAtSelection([token('6'), token('+'), token('5')], selection, [token('×')]);

    expect(result.tokens.map(({ value }) => value)).toEqual(['6', '×', '5']);
    expect(result.selection).toEqual({ kind: 'token', index: 1 });
  });

  test('inserts into a selected blank slot and moves the slot after the inserted token', () => {
    const selection: EditorSelection = { kind: 'slot', index: 1 };
    const result = insertTokensAtSelection([token('6'), token('5')], selection, [token('+')]);

    expect(result.tokens.map(({ value }) => value)).toEqual(['6', '+', '5']);
    expect(result.selection).toEqual({ kind: 'slot', index: 2 });
  });

  test('deletes a selected token', () => {
    const selection: EditorSelection = { kind: 'token', index: 1 };
    const result = deleteAtSelection([token('6'), token('+'), token('5')], selection);

    expect(result.tokens.map(({ value }) => value)).toEqual(['6', '5']);
    expect(result.selection).toEqual({ kind: 'slot', index: 1 });
  });

  test('backspaces before a selected blank slot', () => {
    const selection: EditorSelection = { kind: 'slot', index: 2 };
    const result = deleteAtSelection([token('6'), token('+'), token('5')], selection);

    expect(result.tokens.map(({ value }) => value)).toEqual(['6', '5']);
    expect(result.selection).toEqual({ kind: 'slot', index: 1 });
  });

  test('deletes adjacent paired delimiters when backspacing the slot between them', () => {
    const selection: EditorSelection = { kind: 'slot', index: 1 };
    const result = deleteAtSelection([token('('), token(')')], selection);

    expect(result.tokens).toEqual([]);
    expect(result.selection).toEqual({ kind: 'slot', index: 0 });
  });

  test('deletes absolute value delimiters when backspacing the slot between them', () => {
    const selection: EditorSelection = { kind: 'slot', index: 1 };
    const result = deleteAtSelection([
      token('|', { role: 'absoluteOpen' }),
      token('|', { role: 'absoluteClose' }),
    ], selection);

    expect(result.tokens).toEqual([]);
    expect(result.selection).toEqual({ kind: 'slot', index: 0 });
  });

  test('moves selection to the next element on the right and left for non-empty tokens', () => {
    expect(moveSelectionHorizontally(3, { kind: 'slot', index: 0 }, 1)).toEqual({ kind: 'token', index: 0 });
    expect(moveSelectionHorizontally(3, { kind: 'slot', index: 0 }, -1)).toEqual({ kind: 'slot', index: 3 });
    expect(moveSelectionHorizontally(3, { kind: 'token', index: 2 }, 1)).toEqual({ kind: 'slot', index: 3 });
  });

  test('cycles through every source token and insertion slot in logical order', () => {
    const visited: EditorSelection[] = [];
    let selection: EditorSelection = { kind: 'slot', index: 0 };

    for (let index = 0; index < 8; index += 1) {
      selection = moveSelectionHorizontally(3, selection, 1);
      visited.push(selection);
    }

    expect(visited).toEqual([
      { kind: 'token', index: 0 },
      { kind: 'slot', index: 1 },
      { kind: 'token', index: 1 },
      { kind: 'slot', index: 2 },
      { kind: 'token', index: 2 },
      { kind: 'slot', index: 3 },
      { kind: 'slot', index: 0 },
      { kind: 'token', index: 0 },
    ]);
  });

  test('keeps empty editors at the only slot and normalizes invalid starting selections', () => {
    expect(moveSelectionHorizontally(0, { kind: 'slot', index: 0 }, -1)).toEqual({
      kind: 'slot',
      index: 0,
    });
    expect(moveSelectionHorizontally(0, { kind: 'token', index: 5 }, 1)).toEqual({
      kind: 'slot',
      index: 0,
    });
  });
});
