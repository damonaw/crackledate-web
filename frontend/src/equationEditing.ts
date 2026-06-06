export type EditableEquationToken = {
  value: string;
  role?: 'absoluteOpen' | 'absoluteClose';
};

export type SlotPlacement = 'fractionNumeratorStart' | 'fractionDenominatorEnd';

export type EditorSelection =
  | { kind: 'slot'; index: number; placement?: SlotPlacement }
  | { kind: 'token'; index: number };

export function moveSelectionHorizontally(
  tokenCount: number,
  selection: EditorSelection,
  direction: -1 | 1,
): EditorSelection {
  if (tokenCount === 0) {
    return { kind: 'slot', index: 0 };
  }

  const normalized = normalizeEditorSelection(selection, tokenCount);
  const elementPosition = normalized.kind === 'slot'
    ? normalized.index * 2
    : normalized.index * 2 + 1;

  const maxPosition = tokenCount * 2;
  const nextPosition = ((elementPosition + direction) % (maxPosition + 1) + (maxPosition + 1)) % (maxPosition + 1);

  return nextPosition % 2 === 0
    ? { kind: 'slot', index: nextPosition / 2 }
    : { kind: 'token', index: (nextPosition - 1) / 2 };
}

export function insertTokensAtSelection<T extends EditableEquationToken>(
  tokens: readonly T[],
  selection: EditorSelection,
  insertedTokens: readonly T[],
): { tokens: T[]; selection: EditorSelection } {
  const normalizedSelection = normalizeEditorSelection(selection, tokens.length);
  const next = [...tokens];

  if (normalizedSelection.kind === 'token') {
    next.splice(normalizedSelection.index, 1, ...insertedTokens);
    return {
      tokens: next,
      selection:
        insertedTokens.length === 1
          ? { kind: 'token', index: normalizedSelection.index }
          : { kind: 'slot', index: normalizedSelection.index + Math.min(1, insertedTokens.length) },
    };
  }

  next.splice(normalizedSelection.index, 0, ...insertedTokens);
  return {
    tokens: next,
    selection: { kind: 'slot', index: normalizedSelection.index + insertedTokens.length },
  };
}

export function deleteAtSelection<T extends EditableEquationToken>(
  tokens: readonly T[],
  selection: EditorSelection,
): { tokens: T[]; selection: EditorSelection } {
  const normalizedSelection = normalizeEditorSelection(selection, tokens.length);

  if (normalizedSelection.kind === 'token') {
    const range = pairedTokenRange(tokens, normalizedSelection.index) ?? {
      start: normalizedSelection.index,
      deleteCount: 1,
    };
    return removeRange(tokens, range.start, range.deleteCount);
  }

  if (normalizedSelection.index === 0) {
    return { tokens: [...tokens], selection: normalizedSelection };
  }

  if (isPairedDelimiter(tokens[normalizedSelection.index - 1], tokens[normalizedSelection.index])) {
    return removeRange(tokens, normalizedSelection.index - 1, 2);
  }

  return removeRange(tokens, normalizedSelection.index - 1, 1);
}

export function normalizeEditorSelection(selection: EditorSelection, tokenCount: number): EditorSelection {
  if (selection.kind === 'token') {
    if (tokenCount === 0) return { kind: 'slot', index: 0 };
    return { kind: 'token', index: clamp(selection.index, 0, tokenCount - 1) };
  }

  return { ...selection, index: clamp(selection.index, 0, tokenCount) };
}

function removeRange<T extends EditableEquationToken>(
  tokens: readonly T[],
  start: number,
  deleteCount: number,
): { tokens: T[]; selection: EditorSelection } {
  const next = [...tokens];
  next.splice(start, deleteCount);
  return { tokens: next, selection: { kind: 'slot', index: start } };
}

function pairedTokenRange<T extends EditableEquationToken>(
  tokens: readonly T[],
  index: number,
): { start: number; deleteCount: number } | null {
  if (isPairedDelimiter(tokens[index], tokens[index + 1])) {
    return { start: index, deleteCount: 2 };
  }
  if (isPairedDelimiter(tokens[index - 1], tokens[index])) {
    return { start: index - 1, deleteCount: 2 };
  }
  return null;
}

function isPairedDelimiter(
  left: EditableEquationToken | undefined,
  right: EditableEquationToken | undefined,
): boolean {
  return (left?.value === '(' && right?.value === ')') || isAbsoluteValuePair(left, right);
}

function isAbsoluteValuePair(
  left: EditableEquationToken | undefined,
  right: EditableEquationToken | undefined,
): boolean {
  return left?.value === '|' && left.role === 'absoluteOpen' && right?.value === '|' && right.role === 'absoluteClose';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
