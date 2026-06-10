export type Puzzle = {
  dateIdentifier: string;
  displayDate: string;
  formattedDate: string;
  digits: number[];
  delimiterPositions: number[];
};

export type EvaluationResponse = {
  left: string;
  right: string;
  errorMessage?: string;
};

export type ValidationResponse = {
  valid: boolean;
  leftValue?: string;
  rightValue?: string;
  errorMessage?: string;
};

export type SubmissionDifficulty = 'easy' | 'hard';
export type SubmissionPlatform = 'web' | 'ios' | 'android';

export type SolutionSubmission = {
  date: string;
  equation: string;
  seconds: number;
  difficulty: SubmissionDifficulty;
  platform: SubmissionPlatform;
  appVersion?: string;
};

export type EditableEquationToken = {
  value: string;
  role?: 'absoluteOpen' | 'absoluteClose';
  digitIndex?: number;
};

export type SlotPlacement = 'fractionNumeratorStart' | 'fractionDenominatorEnd';

export type EditorSelection =
  | { kind: 'slot'; index: number; placement?: SlotPlacement }
  | { kind: 'token'; index: number };

export type BadgeSolution = {
  equation: string;
  timestamp?: string;
  value: string;
};

export type BadgeSolutionsByDate<T extends BadgeSolution = BadgeSolution> = Record<string, readonly T[] | undefined>;

export type SolutionBadgeId =
  | 'first-solution'
  | 'three-day-streak'
  | 'zero-equals-zero'
  | 'multiplied-by-zero'
  | 'double-decker';

export type SolutionBadge = {
  id: SolutionBadgeId;
  title: string;
  description: string;
  earnedDate?: string;
  iconSrc?: string;
  earned: boolean;
};

const tolerance = 1e-10;
const decimalDisplayPlaces = 12;
const plainIntegerDisplayDigits = 24;
const maximumMagnitudeDigits = 120;
const maximumComponentDigits = 512;
const maximumRepeatingDecimalDigits = 128;
const combiningOverline = '\u0305';
const dayMs = 24 * 60 * 60 * 1000;

const errNumberLarge = 'number is too large';
const errUnexpectedEnd = 'unexpected end of expression';

export function puzzleForDate(date = new Date()): Puzzle {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const month = normalized.getMonth() + 1;
  const day = normalized.getDate();
  const year = normalized.getFullYear();
  const formattedDate = `${month}-${day}-${year}`;
  const digits: number[] = [];
  const delimiterPositions: number[] = [];
  let digitIndex = 0;

  for (const character of formattedDate) {
    if (/\d/.test(character)) {
      digits.push(Number(character));
      digitIndex += 1;
    } else if (character === '-') {
      delimiterPositions.push(digitIndex - 1);
    }
  }

  return {
    dateIdentifier: dateIdentifier(normalized),
    displayDate: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(normalized),
    formattedDate,
    digits,
    delimiterPositions,
  };
}

export function runningValues(equation: string): EvaluationResponse {
  const parts = equation.split(/=(.*)/s, 2);
  if (equation.includes('=')) {
    const left = evaluateDisplay(parts[0] ?? '');
    const right = evaluateDisplay(parts[1] ?? '');
    return optionalError({ left: left.display, right: right.display }, firstError(left.errorMessage, right.errorMessage));
  }

  const left = evaluateDisplay(equation);
  return optionalError({ left: left.display, right: '?' }, left.errorMessage);
}

export function validateEquation(equation: string, expectedDigits: number[]): ValidationResponse {
  if (equation.trim() === '') {
    return invalid('Equation cannot be empty');
  }
  if (countMatches(equation, '=') !== 1) {
    return invalid('Equation must contain exactly one equals sign');
  }
  if (!digitsMatch(equation, expectedDigits)) {
    return invalid('Digits must be used in date order');
  }

  const [leftText, rightText] = equation.split('=');
  if ((leftText ?? '').trim() === '') {
    return invalid('Left side of equation is empty');
  }
  if ((rightText ?? '').trim() === '') {
    return invalid('Right side of equation is empty');
  }

  try {
    const left = evaluate(leftText ?? '');
    const right = evaluate(rightText ?? '');
    const leftValue = formatNumber(left);
    const rightValue = formatNumber(right);

    if (!numbersEqual(left, right)) {
      return {
        valid: false,
        leftValue,
        rightValue,
        errorMessage: `Left side (${leftValue}) does not equal right side (${rightValue})`,
      };
    }

    return { valid: true, leftValue, rightValue };
  } catch (error) {
    return invalid(readableError(error));
  }
}

export function moveSelectionHorizontally(
  tokenCount: number,
  selection: EditorSelection,
  direction: -1 | 1,
): EditorSelection {
  if (tokenCount === 0) {
    return { kind: 'slot', index: 0 };
  }

  const normalized = normalizeEditorSelection(selection, tokenCount);
  const elementPosition = normalized.kind === 'slot' ? normalized.index * 2 : normalized.index * 2 + 1;
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

export function nextAbsoluteDelimiterRole(
  tokens: readonly EditableEquationToken[],
  selection: EditorSelection,
): NonNullable<EditableEquationToken['role']> {
  const normalizedSelection = normalizeEditorSelection(selection, tokens.length);
  const boundaryIndex = normalizedSelection.index;
  let unmatchedOpenCount = 0;

  for (const token of tokens.slice(0, boundaryIndex)) {
    if (token.value !== '|') continue;
    if (token.role === 'absoluteClose') {
      unmatchedOpenCount = Math.max(0, unmatchedOpenCount - 1);
      continue;
    }
    unmatchedOpenCount += 1;
  }

  return unmatchedOpenCount > 0 ? 'absoluteClose' : 'absoluteOpen';
}

export function normalizeEditorSelection(selection: EditorSelection, tokenCount: number): EditorSelection {
  if (selection.kind === 'token') {
    if (tokenCount === 0) return { kind: 'slot', index: 0 };
    return { kind: 'token', index: clamp(selection.index, 0, tokenCount - 1) };
  }

  return { ...selection, index: clamp(selection.index, 0, tokenCount) };
}

export function equationText(tokens: readonly EditableEquationToken[]): string {
  return tokens.map((token) => token.value).join('');
}

export function usedDigitIndices(tokens: readonly EditableEquationToken[]): Set<number> {
  return new Set(tokens.map((token) => token.digitIndex).filter((value): value is number => value !== undefined));
}

export function firstUnusedDigitIndex(tokens: readonly EditableEquationToken[], digits: readonly number[]): number | null {
  const used = usedDigitIndices(tokens);
  for (let index = 0; index < digits.length; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

export function savedSolutionDateSet<T>(solutionsByDate: Record<string, readonly T[] | undefined>): Set<string> {
  return new Set(
    Object.entries(solutionsByDate)
      .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
      .map(([dateIdentifierValue]) => dateIdentifierValue),
  );
}

export function solutionBadges(solutionsByDate: BadgeSolutionsByDate): SolutionBadge[] {
  const solvedDates = Object.entries(solutionsByDate)
    .filter(([, solutions]) => solutions !== undefined && solutions.length > 0)
    .map(([dateIdentifierValue]) => dateIdentifierValue);

  const allSolutions = Object.entries(solutionsByDate).flatMap(([dateIdentifierValue, solutions]) =>
    (solutions ?? []).map((solution) => ({ ...solution, dateIdentifier: dateIdentifierValue })),
  );
  const firstSolution = earliestSolution(allSolutions);
  const threeDayStreakDate = firstThreeDayStreakEarnedDate(solvedDates);
  const firstZeroSolution = earliestSolution(allSolutions.filter((solution) => isZeroValue(solution.value)));
  const firstZeroMultiplication = earliestSolution(
    allSolutions.filter((solution) => hasMultiplicationByZero(solution.equation)),
  );
  const firstDoubleDecker = earliestSolution(allSolutions.filter((solution) => hasStackedDivision(solution.equation)));

  return [
    {
      id: 'first-solution',
      title: 'First Solution',
      description: 'Save at least one correct solution.',
      earnedDate: firstSolution?.earnedDate,
      iconSrc: '/badges/first-solve.png',
      earned: firstSolution !== undefined,
    },
    {
      id: 'three-day-streak',
      title: 'Three Day Streak',
      description: 'Save solutions on three consecutive puzzle dates.',
      earnedDate: threeDayStreakDate,
      iconSrc: '/badges/three-day-streak.png',
      earned: threeDayStreakDate !== undefined,
    },
    {
      id: 'zero-equals-zero',
      title: 'Zero = Zero',
      description: 'Save a solution where both sides equal zero.',
      earnedDate: firstZeroSolution?.earnedDate,
      iconSrc: '/badges/zero-equals-zero.png',
      earned: firstZeroSolution !== undefined,
    },
    {
      id: 'multiplied-by-zero',
      title: 'Multiplied by Zero',
      description: 'Use multiplication by zero in a saved solution.',
      earnedDate: firstZeroMultiplication?.earnedDate,
      iconSrc: '/badges/multiplied-by-zero.png',
      earned: firstZeroMultiplication !== undefined,
    },
    {
      id: 'double-decker',
      title: 'Double Decker',
      description: 'Stack division on top of division in a saved solution.',
      earnedDate: firstDoubleDecker?.earnedDate,
      iconSrc: '/badges/double-decker.png',
      earned: firstDoubleDecker !== undefined,
    },
  ];
}

type TokenKind = 'number' | 'operator' | 'equals';

type Token = {
  kind: TokenKind;
  text: string;
  value?: NumberValue;
};

type NumberValue =
  | { kind: 'rational'; value: Rational }
  | { kind: 'float'; value: number };

type Rational = {
  numerator: bigint;
  denominator: bigint;
};

function evaluate(expression: string): NumberValue {
  const tokens = lex(expression);
  const parser = new ExpressionParser(tokens);
  const value = parser.parseExpression();
  if (!parser.isAtEnd()) {
    throw new Error(`unexpected token: ${parser.peek().text}`);
  }
  return checked(value);
}

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  const characters = Array.from(input);

  for (let index = 0; index < characters.length;) {
    const character = characters[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character)) {
      const start = index;
      while (index < characters.length && /\d/.test(characters[index])) {
        index += 1;
      }
      const text = characters.slice(start, index).join('');
      if (text.length > 1 && text.startsWith('0')) {
        throw new Error(`invalid number ${text}`);
      }
      tokens.push({ kind: 'number', text, value: checked(numberFromBigInt(BigInt(text))) });
      continue;
    }

    if ('+-*×xX/÷^√!()|'.includes(character)) {
      tokens.push({ kind: 'operator', text: character });
    } else if (character === '=') {
      tokens.push({ kind: 'equals', text: character });
    } else {
      throw new Error(`unexpected character ${character}`);
    }
    index += 1;
  }

  return tokens;
}

class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): NumberValue {
    return this.parseExpressionUntil();
  }

  parseExpressionUntil(stopOperators?: ReadonlySet<string>): NumberValue {
    let result = this.parseTerm(stopOperators);

    while (!this.isAtStop(stopOperators) && (this.matchOperator('+') || this.matchOperator('-'))) {
      const operation = this.previous().text;
      const right = this.parseTerm(stopOperators);
      result = operation === '+' ? addNumbers(result, right) : subtractNumbers(result, right);
    }

    return result;
  }

  parseTerm(stopOperators?: ReadonlySet<string>): NumberValue {
    let result = this.parsePower(stopOperators);

    while (!this.isAtStop(stopOperators)) {
      if (this.matchOperator('*') || this.matchOperator('×') || this.matchOperator('x') || this.matchOperator('X')) {
        result = multiplyNumbers(result, this.parsePower(stopOperators));
      } else if (this.matchOperator('/') || this.matchOperator('÷')) {
        result = divideNumbers(result, this.parsePower(stopOperators));
      } else if (this.startsImplicitMultiplication(stopOperators)) {
        result = multiplyNumbers(result, this.parsePower(stopOperators));
      } else {
        break;
      }
    }

    return result;
  }

  parsePower(stopOperators?: ReadonlySet<string>): NumberValue {
    const left = this.parseUnary(stopOperators);
    if (!this.isAtStop(stopOperators) && this.matchOperator('^')) {
      return powerNumbers(left, this.parsePower(stopOperators));
    }
    return left;
  }

  parseUnary(stopOperators?: ReadonlySet<string>): NumberValue {
    if (this.matchOperator('-')) {
      return negateNumber(this.parseUnary(stopOperators));
    }
    if (this.matchOperator('√')) {
      return sqrtNumber(this.parseUnary(stopOperators));
    }
    return this.parsePostfix(stopOperators);
  }

  parsePostfix(stopOperators?: ReadonlySet<string>): NumberValue {
    let result = this.parsePrimary(stopOperators);
    while (!this.isAtStop(stopOperators) && this.matchOperator('!')) {
      result = factorialNumber(result);
    }
    return checked(result);
  }

  parsePrimary(stopOperators?: ReadonlySet<string>): NumberValue {
    if (this.isAtEnd() || this.isAtStop(stopOperators)) {
      throw new Error(errUnexpectedEnd);
    }
    if (this.matchKind('number')) {
      return cloneNumber(this.previous().value ?? numberFromBigInt(0n));
    }
    if (this.matchOperator('(')) {
      const value = this.parseExpressionUntil(new Set([')']));
      if (!this.matchOperator(')')) {
        throw new Error('missing closing parenthesis');
      }
      return value;
    }
    if (this.matchOperator('|')) {
      const value = this.parseExpressionUntil(new Set(['|']));
      if (!this.matchOperator('|')) {
        throw new Error('missing closing absolute value');
      }
      return absNumber(value);
    }
    throw new Error(`unexpected token: ${this.peek().text}`);
  }

  startsImplicitMultiplication(stopOperators?: ReadonlySet<string>): boolean {
    if (this.isAtEnd() || this.isAtStop(stopOperators)) {
      return false;
    }
    const current = this.peek();
    if (current.kind === 'number') return true;
    return current.kind === 'operator' && (current.text === '(' || current.text === '|' || current.text === '√');
  }

  isAtStop(stopOperators?: ReadonlySet<string>): boolean {
    if (!stopOperators || this.isAtEnd()) return false;
    const current = this.peek();
    return current.kind === 'operator' && stopOperators.has(current.text);
  }

  matchKind(kind: TokenKind): boolean {
    if (this.isAtEnd() || this.peek().kind !== kind) return false;
    this.index += 1;
    return true;
  }

  matchOperator(operator: string): boolean {
    if (this.isAtEnd()) return false;
    const current = this.peek();
    if (current.kind !== 'operator' || current.text !== operator) return false;
    this.index += 1;
    return true;
  }

  previous(): Token {
    return this.tokens[this.index - 1];
  }

  peek(): Token {
    return this.tokens[this.index];
  }

  isAtEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}

function numberFromBigInt(value: bigint): NumberValue {
  return { kind: 'rational', value: makeRational(value, 1n) };
}

function numberFromRational(value: Rational): NumberValue {
  return { kind: 'rational', value: normalizeRational(value) };
}

function numberFromFloat(value: number): NumberValue {
  return { kind: 'float', value };
}

function cloneNumber(value: NumberValue): NumberValue {
  if (value.kind === 'float') return { ...value };
  return numberFromRational(value.value);
}

function makeRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) {
    throw new Error('division by zero');
  }
  return normalizeRational({ numerator, denominator });
}

function normalizeRational(value: Rational): Rational {
  let numerator = value.numerator;
  let denominator = value.denominator;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const factor = gcd(absBigInt(numerator), denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
}

function addNumbers(left: NumberValue, right: NumberValue): NumberValue {
  if (left.kind === 'rational' && right.kind === 'rational') {
    return checked(
      numberFromRational(
        makeRational(
          left.value.numerator * right.value.denominator + right.value.numerator * left.value.denominator,
          left.value.denominator * right.value.denominator,
        ),
      ),
    );
  }
  return checked(numberFromFloat(toFloat(left) + toFloat(right)));
}

function subtractNumbers(left: NumberValue, right: NumberValue): NumberValue {
  return addNumbers(left, negateNumber(right));
}

function multiplyNumbers(left: NumberValue, right: NumberValue): NumberValue {
  if (left.kind === 'rational' && right.kind === 'rational') {
    return checked(
      numberFromRational(
        makeRational(left.value.numerator * right.value.numerator, left.value.denominator * right.value.denominator),
      ),
    );
  }
  return checked(numberFromFloat(toFloat(left) * toFloat(right)));
}

function divideNumbers(left: NumberValue, right: NumberValue): NumberValue {
  if (isZero(right)) {
    throw new Error('division by zero');
  }
  if (left.kind === 'rational' && right.kind === 'rational') {
    return checked(
      numberFromRational(
        makeRational(left.value.numerator * right.value.denominator, left.value.denominator * right.value.numerator),
      ),
    );
  }
  return checked(numberFromFloat(toFloat(left) / toFloat(right)));
}

function negateNumber(value: NumberValue): NumberValue {
  if (value.kind === 'rational') {
    return numberFromRational({ numerator: -value.value.numerator, denominator: value.value.denominator });
  }
  return numberFromFloat(-value.value);
}

function absNumber(value: NumberValue): NumberValue {
  return isNegative(value) ? negateNumber(value) : value;
}

function sqrtNumber(value: NumberValue): NumberValue {
  if (isNegative(value)) {
    throw new Error('result is an imaginary number');
  }
  if (value.kind === 'rational') {
    const numeratorRoot = perfectSquareRoot(value.value.numerator);
    const denominatorRoot = perfectSquareRoot(value.value.denominator);
    if (numeratorRoot !== null && denominatorRoot !== null) {
      return numberFromRational(makeRational(numeratorRoot, denominatorRoot));
    }
  }
  return checked(numberFromFloat(Math.sqrt(toFloat(value))));
}

function powerNumbers(left: NumberValue, right: NumberValue): NumberValue {
  const exponent = exactInteger(right);
  if (exponent !== null) {
    return integerPower(left, exponent);
  }
  if (isNegative(left)) {
    throw new Error('result is an imaginary number');
  }
  const result = Math.pow(toFloat(left), toFloat(right));
  if (!Number.isFinite(result) || Number.isNaN(result)) {
    throw new Error(errNumberLarge);
  }
  return checked(numberFromFloat(result));
}

function integerPower(base: NumberValue, exponent: bigint): NumberValue {
  if (exponent === 0n) {
    return numberFromBigInt(1n);
  }
  if (isZero(base) && exponent < 0n) {
    throw new Error('division by zero');
  }
  if (base.kind === 'float') {
    const exponentNumber = boundedInteger(exponent);
    if (exponentNumber === null) throw new Error(errNumberLarge);
    return checked(numberFromFloat(Math.pow(base.value, exponentNumber)));
  }

  const negativeExponent = exponent < 0n;
  const absExponent = absBigInt(exponent);
  if (!powerIsReasonablyBounded(base.value, absExponent, negativeExponent)) {
    throw new Error(errNumberLarge);
  }

  const numerator = powBigInt(base.value.numerator, absExponent);
  const denominator = powBigInt(base.value.denominator, absExponent);
  return checked(
    negativeExponent ? numberFromRational(makeRational(denominator, numerator)) : numberFromRational(makeRational(numerator, denominator)),
  );
}

function factorialNumber(value: NumberValue): NumberValue {
  const integerValue = exactInteger(value);
  if (integerValue === null || integerValue < 0n) {
    throw new Error('factorial requires a non-negative integer');
  }
  if (!factorialIsReasonablyBounded(integerValue)) {
    throw new Error(errNumberLarge);
  }

  let result = 1n;
  for (let factor = 2n; factor <= integerValue; factor += 1n) {
    result *= factor;
  }
  return checked(numberFromBigInt(result));
}

function checked(value: NumberValue): NumberValue {
  if (value.kind === 'rational') {
    if (digitsBigInt(value.value.numerator) > maximumComponentDigits || digitsBigInt(value.value.denominator) > maximumComponentDigits) {
      throw new Error(errNumberLarge);
    }
    if (integerDigitsRational(value.value) > maximumMagnitudeDigits) {
      throw new Error(errNumberLarge);
    }
    return value;
  }

  if (!Number.isFinite(value.value) || Number.isNaN(value.value) || magnitudeDigitsFloat(value.value) > maximumMagnitudeDigits) {
    throw new Error(errNumberLarge);
  }
  return value;
}

function numbersEqual(left: NumberValue, right: NumberValue): boolean {
  if (left.kind === 'rational' && right.kind === 'rational') {
    return left.value.numerator === right.value.numerator && left.value.denominator === right.value.denominator;
  }
  return Math.abs(toFloat(left) - toFloat(right)) <= tolerance;
}

function formatNumber(value: NumberValue): string {
  const integerValue = exactInteger(value);
  if (integerValue !== null) {
    const text = integerValue.toString();
    if (text.replace(/^-/, '').length <= plainIntegerDisplayDigits) {
      return text;
    }
    return scientificStringFromInt(integerValue);
  }

  if (value.kind === 'rational') {
    return formatRationalDecimal(value.value);
  }

  return trimDecimal(value.value.toPrecision(decimalDisplayPlaces));
}

function formatRationalDecimal(value: Rational): string {
  if (value.denominator === 1n) {
    return value.numerator.toString();
  }

  const sign = value.numerator < 0n ? '-' : '';
  const numerator = absBigInt(value.numerator);
  const integerPart = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  if (remainder === 0n) {
    return sign + integerPart.toString();
  }

  const digits: string[] = [];
  const remainders = new Map<string, number>();

  while (remainder !== 0n) {
    const key = remainder.toString();
    if (remainders.has(key)) {
      break;
    }
    if (digits.length >= maximumRepeatingDecimalDigits) {
      return trimDecimal((Number(numerator) / Number(value.denominator)).toFixed(decimalDisplayPlaces));
    }
    remainders.set(key, digits.length);
    remainder *= 10n;
    digits.push((remainder / value.denominator).toString());
    remainder %= value.denominator;
  }

  const decimalPrefix = `${sign}${integerPart.toString()}.`;
  if (remainder === 0n) {
    return decimalPrefix + digits.join('');
  }

  const repeatStart = remainders.get(remainder.toString()) ?? digits.length;
  const nonRepeating = digits.slice(0, repeatStart).join('');
  const repeating = digits.slice(repeatStart).join('');
  return decimalPrefix + nonRepeating + overlineDigits(repeating);
}

function evaluateDisplay(expression: string): { display: string; errorMessage?: string } {
  if (expression.trim() === '') {
    return { display: '?' };
  }
  try {
    return { display: formatNumber(evaluate(expression)) };
  } catch (error) {
    return { display: '?', errorMessage: readableError(error) };
  }
}

function digitsMatch(equation: string, expectedDigits: number[]): boolean {
  const found = Array.from(equation)
    .filter((character) => /\d/.test(character))
    .map(Number);

  return found.length === expectedDigits.length && expectedDigits.every((digit, index) => found[index] === digit);
}

function invalid(message: string): ValidationResponse {
  return { valid: false, errorMessage: message };
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (message.includes(errNumberLarge)) return 'Calculated number is too large';
  if (lower.includes('imaginary')) return 'Result is an imaginary number';
  if (lower.includes('division by zero')) return 'Cannot divide by zero';
  return 'Equation could not be evaluated';
}

function optionalError<T extends EvaluationResponse>(response: T, errorMessage?: string): T {
  if (!errorMessage) return response;
  return { ...response, errorMessage };
}

function firstError(...messages: Array<string | undefined>): string | undefined {
  return messages.find((message) => message !== undefined && message !== '');
}

function countMatches(value: string, pattern: string): number {
  return Array.from(value).filter((character) => character === pattern).length;
}

function dateIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toFloat(value: NumberValue): number {
  return value.kind === 'float' ? value.value : Number(value.value.numerator) / Number(value.value.denominator);
}

function isZero(value: NumberValue): boolean {
  return value.kind === 'rational' ? value.value.numerator === 0n : Math.abs(value.value) <= tolerance;
}

function isNegative(value: NumberValue): boolean {
  return value.kind === 'rational' ? value.value.numerator < 0n : value.value < 0;
}

function exactInteger(value: NumberValue): bigint | null {
  if (value.kind === 'float') {
    if (!Number.isSafeInteger(value.value)) return null;
    return BigInt(value.value);
  }
  return value.value.denominator === 1n ? value.value.numerator : null;
}

function boundedInteger(value: bigint): number | null {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(value);
}

function perfectSquareRoot(value: bigint): bigint | null {
  if (value < 0n) return null;
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low <= high) {
    const middle = (low + high) / 2n;
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) {
      low = middle + 1n;
    } else {
      high = middle - 1n;
    }
  }
  return null;
}

function powerIsReasonablyBounded(base: Rational, exponent: bigint, negativeExponent: boolean): boolean {
  const exponentNumber = exponent > 10_000n ? 10_001 : Number(exponent);
  if (estimatedMagnitudeDigits(base, exponentNumber) > maximumMagnitudeDigits) {
    return false;
  }
  const numeratorDigits = digitsBigInt(base.numerator) * exponentNumber;
  const denominatorDigits = digitsBigInt(base.denominator) * exponentNumber;
  if (numeratorDigits > maximumComponentDigits || denominatorDigits > maximumComponentDigits) {
    return false;
  }
  if (negativeExponent && base.numerator === 0n) {
    return false;
  }
  return true;
}

function estimatedMagnitudeDigits(base: Rational, exponent: number): number {
  if (base.numerator === 0n) return 1;
  const numerator = Math.log10(Math.abs(Number(base.numerator)));
  const denominator = Math.log10(Number(base.denominator));
  return Math.floor((numerator - denominator) * exponent) + 1;
}

function factorialIsReasonablyBounded(value: bigint): boolean {
  if (value > 200n) return false;
  let digits = 1;
  for (let factor = 2; factor <= Number(value); factor += 1) {
    digits += Math.log10(factor);
    if (digits > maximumComponentDigits) return false;
  }
  return true;
}

function powBigInt(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let factor = base;
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining % 2n === 1n) result *= factor;
    remaining /= 2n;
    if (remaining > 0n) factor *= factor;
  }
  return result;
}

function digitsBigInt(value: bigint): number {
  return absBigInt(value).toString().length;
}

function integerDigitsRational(value: Rational): number {
  if (value.numerator === 0n) return 1;
  return (absBigInt(value.numerator) / value.denominator).toString().length;
}

function magnitudeDigitsFloat(value: number): number {
  if (value === 0) return 1;
  return Math.floor(Math.log10(Math.abs(value))) + 1;
}

function scientificStringFromInt(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const digits = absBigInt(value).toString();
  const mantissa = `${digits[0]}.${digits.slice(1, 4)}`.replace(/\.?0+$/, '');
  return `${sign}${mantissa}e+${digits.length - 1}`;
}

function trimDecimal(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+(e.*)?$/i, '$1$2').replace(/\.0+(e.*)?$/i, '$1');
}

function overlineDigits(value: string): string {
  return Array.from(value)
    .map((character) => `${character}${combiningOverline}`)
    .join('');
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0n ? 1n : a;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
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

function isPairedDelimiter(left: EditableEquationToken | undefined, right: EditableEquationToken | undefined): boolean {
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

function firstThreeDayStreakEarnedDate(dateIdentifiers: string[]): string | undefined {
  const days = [...new Set(dateIdentifiers.map(dayNumberFromIdentifier).filter((day) => day !== null))].sort(
    (left, right) => left - right,
  );
  let streak = 0;
  let previousDay: number | null = null;

  for (const day of days) {
    streak = previousDay === null || day !== previousDay + 1 ? 1 : streak + 1;
    if (streak >= 3) {
      return dateIdentifierFromDayNumber(day);
    }
    previousDay = day;
  }

  return undefined;
}

function earliestSolution<T extends BadgeSolution & { dateIdentifier: string }>(
  solutions: T[],
): { earnedDate: string; sortTime: number } | undefined {
  return solutions
    .map((solution) => {
      const timestampDate = dateIdentifierFromTimestamp(solution.timestamp);
      const earnedDate = timestampDate ?? solution.dateIdentifier;
      return {
        earnedDate,
        sortTime: timestampDate
          ? Date.parse(solution.timestamp ?? '')
          : (dayNumberFromIdentifier(solution.dateIdentifier) ?? 0) * dayMs,
      };
    })
    .sort((left, right) => left.sortTime - right.sortTime)[0];
}

function dayNumberFromIdentifier(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / dayMs);
}

function dateIdentifierFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * dayMs).toISOString().slice(0, 10);
}

function dateIdentifierFromTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
}

function isZeroValue(value: string): boolean {
  return /^[+-]?0(?:\.0+)?$/.test(value.trim());
}

function hasMultiplicationByZero(equation: string): boolean {
  return tokenizeEquation(equation).some((token, index, tokens) => {
    if (token !== '*') return false;
    return tokens[index - 1] === '0' || tokens[index + 1] === '0';
  });
}

function hasStackedDivision(equation: string): boolean {
  const sides = equation.split('=');
  return sides.some((side) => tokenizeEquation(side).filter((token) => token === '/').length >= 2);
}

function tokenizeEquation(equation: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < equation.length;) {
    const character = equation[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (/\d/.test(character)) {
      let value = character;
      index += 1;
      while (index < equation.length && /\d/.test(equation[index])) {
        value += equation[index];
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    if (character === '*' || character === '×' || character === 'x' || character === 'X') {
      tokens.push('*');
    } else if (character === '/' || character === '÷') {
      tokens.push('/');
    } else if (character === '=') {
      tokens.push('=');
    } else {
      tokens.push(character);
    }
    index += 1;
  }
  return tokens;
}
