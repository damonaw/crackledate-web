export type FeedbackToken = {
  value: string;
};

const rightOperandOperators = new Set(['+', '-', '×', '÷', '^', '√']);
const cannotStartOperand = new Set(['=', '+', '×', '÷', '^', ')', '!']);

export function shouldSurfaceEvaluationError(
  tokens: readonly FeedbackToken[],
  nextDigitIndex: number | null,
  errorMessage: string,
): boolean {
  if (!errorMessage || tokens.length === 0) {
    return false;
  }

  if (hasTooManyEquals(tokens) || hasUnmatchedClosingParenthesis(tokens)) {
    return true;
  }

  if (hasSkippedRequiredOperand(tokens)) {
    return true;
  }

  if (hasSkippedEmptyGroup(tokens)) {
    return true;
  }

  return nextDigitIndex === null;
}

function hasTooManyEquals(tokens: readonly FeedbackToken[]): boolean {
  return tokens.filter((token) => token.value === '=').length > 1;
}

function hasUnmatchedClosingParenthesis(tokens: readonly FeedbackToken[]): boolean {
  let openCount = 0;
  for (const token of tokens) {
    if (token.value === '(') {
      openCount += 1;
    } else if (token.value === ')') {
      openCount -= 1;
      if (openCount < 0) {
        return true;
      }
    }
  }

  return false;
}

function hasSkippedRequiredOperand(tokens: readonly FeedbackToken[]): boolean {
  return tokens.some((token, index) => {
    if (!rightOperandOperators.has(token.value)) {
      return false;
    }

    const nextValue = tokens[index + 1]?.value;
    return nextValue !== undefined && cannotStartOperand.has(nextValue);
  });
}

function hasSkippedEmptyGroup(tokens: readonly FeedbackToken[]): boolean {
  return tokens.some((token, index) => {
    if (!isOpeningGroupToken(token.value)) {
      return false;
    }

    const nextValue = tokens[index + 1]?.value;
    if (!isClosingGroupPair(token.value, nextValue)) {
      return false;
    }

    return tokens[index + 2] !== undefined;
  });
}

function isOpeningGroupToken(value: string): boolean {
  return value === '(' || value === '|';
}

function isClosingGroupPair(openValue: string, closeValue: string | undefined): boolean {
  return (openValue === '(' && closeValue === ')') || (openValue === '|' && closeValue === '|');
}
