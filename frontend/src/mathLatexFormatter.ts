type Token =
  | { kind: 'number'; text: string; start: number; end: number }
  | { kind: 'operator'; text: Operator; start: number; end: number }
  | { kind: 'equals'; text: '='; start: number; end: number }
  | { kind: 'leftParen'; text: '('; start: number; end: number }
  | { kind: 'rightParen'; text: ')'; start: number; end: number }
  | { kind: 'absoluteOpen'; text: '|'; start: number; end: number }
  | { kind: 'absoluteClose'; text: '|'; start: number; end: number };

type Operator = '+' | '-' | '*' | '/' | '^' | '√' | '!';
type StopKind = 'rightParen' | 'absoluteClose';

export type EquationLatexToken = {
  value: string;
  role?: 'absoluteOpen' | 'absoluteClose';
};

type NodeBase = {
  start: number;
  end: number;
};

type MathNode =
  | (NodeBase & { kind: 'number'; value: string })
  | (NodeBase & { kind: 'placeholder' })
  | (NodeBase & {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/' | '^';
      left: MathNode;
      right: MathNode;
      operatorStart: number;
      operatorEnd: number;
    })
  | (NodeBase & { kind: 'unary'; operator: '-' | '√'; value: MathNode; operatorStart: number; operatorEnd: number })
  | (NodeBase & { kind: 'postfix'; operator: '!'; value: MathNode; operatorStart: number; operatorEnd: number })
  | (NodeBase & { kind: 'group'; value: MathNode; closed: boolean })
  | (NodeBase & { kind: 'absolute'; value: MathNode; closed: boolean });

type EquationPart = {
  tokens: Token[];
  start: number;
  end: number;
  followingEquals?: Token & { kind: 'equals' };
};

type FormatterOptions = {
  cursorIndex?: number;
  preserveDelimiters?: boolean;
  editorMarkers?: boolean;
  selectedSource?: SourceSelection;
};

type RenderOptions = {
  cursorIndex?: number;
  preserveDelimiters: boolean;
  editorMarkers?: boolean;
  selectedSource?: SourceSelection;
  suppressedSourceSlots?: ReadonlySet<number>;
  suppressStartCursor?: boolean;
  suppressEndCursor?: boolean;
};

type RenderContext = 'top' | 'fraction' | 'exponent' | 'sqrt' | 'absolute' | 'multiplication' | 'base' | 'postfix';
type SlotPlacement = 'fractionNumeratorStart' | 'fractionDenominatorEnd';
type SourceSelection =
  | { kind: 'token'; index: number }
  | { kind: 'slot'; index: number; placement?: SlotPlacement };

const placeholderLatex = '\\phantom{0}';
const cursorLatex = '\\htmlClass{equation-cursor-marker}{\\vphantom{0}}';
const markerLatex = '\\vphantom{0}';

export function equationToLatex(expression: string, options: FormatterOptions = {}): string {
  const tokens = tokenize(expression);
  const cursorIndex = clampCursorIndex(options.cursorIndex, Array.from(expression).length);
  return tokensToLatex(tokens, cursorIndex, options);
}

export function equationTokensToLatex(inputTokens: EquationLatexToken[], options: FormatterOptions = {}): string {
  const tokens = tokensFromInputTokens(inputTokens);
  const cursorIndex = clampCursorIndex(options.cursorIndex, inputTokens.length);
  return tokensToLatex(tokens, cursorIndex, options);
}

function tokensToLatex(tokens: Token[], cursorIndex: number | undefined, options: FormatterOptions): string {
  if (tokens.length === 0) {
    return cursorIndex === undefined ? placeholderLatex : cursorLatex;
  }

  const parts = splitEquation(tokens);
  return parts
    .map((part, index) => {
      const isFinalPart = index === parts.length - 1;
      const renderedPart = renderEquationPart(part, {
        cursorIndex,
        preserveDelimiters: options.preserveDelimiters ?? false,
        editorMarkers: options.editorMarkers,
        selectedSource: options.selectedSource,
        suppressStartCursor: index > 0,
        suppressEndCursor: !isFinalPart,
      });
      const equals = part.followingEquals;
      if (!equals) {
        return renderedPart;
      }

      return [
        renderedPart,
        cursorAt(cursorIndex, equals.start),
        ' ',
        sourceTokenAt(options, equals.start, '='),
        ' ',
        cursorAt(cursorIndex, equals.end),
      ].join('');
    })
    .join('');
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const characters = Array.from(input);
  let nextAbsoluteKind: 'absoluteOpen' | 'absoluteClose' = 'absoluteOpen';

  for (let index = 0; index < characters.length;) {
    const character = characters[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character)) {
      const start = index;
      let text = character;
      index += 1;
      while (index < characters.length && /\d/.test(characters[index])) {
        text += characters[index];
        index += 1;
      }
      tokens.push({ kind: 'number', text, start, end: index });
      continue;
    }

    if (character === '|') {
      tokens.push({ kind: nextAbsoluteKind, text: '|', start: index, end: index + 1 });
      nextAbsoluteKind = nextAbsoluteKind === 'absoluteOpen' ? 'absoluteClose' : 'absoluteOpen';
      index += 1;
      continue;
    }

    const token = tokenForCharacter(character, index);
    if (token) {
      tokens.push(token);
    }

    index += 1;
  }

  return tokens;
}

function tokensFromInputTokens(inputTokens: EquationLatexToken[]): Token[] {
  const tokens: Token[] = [];

  for (let index = 0; index < inputTokens.length;) {
    const token = inputTokens[index];
    if (/^\d$/.test(token.value)) {
      const start = index;
      let text = token.value;
      index += 1;
      while (index < inputTokens.length && /^\d$/.test(inputTokens[index].value)) {
        text += inputTokens[index].value;
        index += 1;
      }
      tokens.push({ kind: 'number', text, start, end: index });
      continue;
    }

    const parsedToken = tokenForInputToken(token, index);
    if (parsedToken) {
      tokens.push(parsedToken);
    }
    index += 1;
  }

  return tokens;
}

function tokenForInputToken(token: EquationLatexToken, start: number): Token | null {
  if (token.value === '|') {
    return {
      kind: token.role === 'absoluteClose' ? 'absoluteClose' : 'absoluteOpen',
      text: '|',
      start,
      end: start + 1,
    };
  }

  return tokenForCharacter(token.value, start);
}

function tokenForCharacter(character: string, start: number): Token | null {
  switch (character) {
    case '+':
      return { kind: 'operator', text: '+', start, end: start + 1 };
    case '-':
    case '−':
      return { kind: 'operator', text: '-', start, end: start + 1 };
    case '*':
    case '×':
    case 'x':
    case 'X':
      return { kind: 'operator', text: '*', start, end: start + 1 };
    case '/':
    case '÷':
      return { kind: 'operator', text: '/', start, end: start + 1 };
    case '^':
      return { kind: 'operator', text: '^', start, end: start + 1 };
    case '√':
      return { kind: 'operator', text: '√', start, end: start + 1 };
    case '!':
      return { kind: 'operator', text: '!', start, end: start + 1 };
    case '(':
      return { kind: 'leftParen', text: '(', start, end: start + 1 };
    case ')':
      return { kind: 'rightParen', text: ')', start, end: start + 1 };
    case '=':
      return { kind: 'equals', text: '=', start, end: start + 1 };
    default:
      return null;
  }
}

function splitEquation(tokens: Token[]): EquationPart[] {
  const parts: EquationPart[] = [];
  let currentTokens: Token[] = [];
  let partStart = tokens[0]?.start ?? 0;

  for (const token of tokens) {
    if (token.kind === 'equals') {
      parts.push({
        tokens: currentTokens,
        start: partStart,
        end: token.start,
        followingEquals: token,
      });
      currentTokens = [];
      partStart = token.end;
      continue;
    }
    currentTokens.push(token);
  }

  const lastToken = currentTokens.at(-1);
  parts.push({
    tokens: currentTokens,
    start: partStart,
    end: lastToken?.end ?? partStart,
  });

  return parts;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(stopKinds: StopKind[] = []): MathNode {
    return this.parseAddSubtract(stopKinds);
  }

  private parseAddSubtract(stopKinds: StopKind[]): MathNode {
    let node = this.parseTerm(stopKinds);

    while (!this.isAtStop(stopKinds) && (this.matchOperator('+') || this.matchOperator('-'))) {
      const operatorToken = this.previous();
      const operator = operatorToken.text as '+' | '-';
      const right = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parseTerm(stopKinds);
      node = binaryNode(operator, node, right, operatorToken.start, operatorToken.end);
    }

    return node;
  }

  private parseTerm(stopKinds: StopKind[]): MathNode {
    let node = this.parsePower(stopKinds);

    while (!this.isAtStop(stopKinds)) {
      if (this.matchOperator('*') || this.matchOperator('/')) {
        const operatorToken = this.previous();
        const operator = operatorToken.text as '*' | '/';
        const right = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parsePower(stopKinds);
        node = binaryNode(operator, node, right, operatorToken.start, operatorToken.end);
        continue;
      }

      if (this.startsImplicitMultiplication(stopKinds)) {
        const operatorPosition = node.end;
        node = binaryNode('*', node, this.parsePower(stopKinds), operatorPosition, operatorPosition);
        continue;
      }

      break;
    }

    return node;
  }

  private parsePower(stopKinds: StopKind[]): MathNode {
    const left = this.parseUnary(stopKinds);

    if (this.matchOperator('^')) {
      const operatorToken = this.previous();
      const right = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parsePower(stopKinds);
      return binaryNode('^', left, right, operatorToken.start, operatorToken.end);
    }

    return left;
  }

  private parseUnary(stopKinds: StopKind[]): MathNode {
    if (this.matchOperator('-')) {
      const operatorToken = this.previous();
      const value = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parseUnary(stopKinds);
      return { kind: 'unary', operator: '-', value, operatorStart: operatorToken.start, operatorEnd: operatorToken.end, start: operatorToken.start, end: value.end };
    }

    if (this.matchOperator('√')) {
      const operatorToken = this.previous();
      const value = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parseUnary(stopKinds);
      return { kind: 'unary', operator: '√', value, operatorStart: operatorToken.start, operatorEnd: operatorToken.end, start: operatorToken.start, end: value.end };
    }

    return this.parsePostfix(stopKinds);
  }

  private parsePostfix(stopKinds: StopKind[]): MathNode {
    let node = this.parsePrimary(stopKinds);

    while (!this.isAtStop(stopKinds) && this.matchOperator('!')) {
      const operatorToken = this.previous();
      node = { kind: 'postfix', operator: '!', value: node, operatorStart: operatorToken.start, operatorEnd: operatorToken.end, start: node.start, end: operatorToken.end };
    }

    return node;
  }

  private parsePrimary(stopKinds: StopKind[]): MathNode {
    if (this.isAtStop(stopKinds)) {
      return placeholderNode(this.currentBoundary());
    }

    const token = this.peek();
    if (!token) {
      return placeholderNode(this.currentBoundary());
    }

    if (token.kind === 'number') {
      this.advance();
      return { kind: 'number', value: token.text, start: token.start, end: token.end };
    }

    if (token.kind === 'leftParen') {
      this.advance();
      const value = this.isAtStop(['rightParen']) ? placeholderNode(token.end) : this.parseExpression(['rightParen']);
      const close = this.matchKind('rightParen') ? this.previous() : undefined;
      return { kind: 'group', value, closed: Boolean(close), start: token.start, end: close?.end ?? value.end };
    }

    if (token.kind === 'absoluteOpen') {
      this.advance();
      const value = this.isAtStop(['absoluteClose']) ? placeholderNode(token.end) : this.parseExpression(['absoluteClose']);
      const close = this.matchKind('absoluteClose') ? this.previous() : undefined;
      return { kind: 'absolute', value, closed: Boolean(close), start: token.start, end: close?.end ?? value.end };
    }

    this.advance();
    return placeholderNode(token.end);
  }

  private startsImplicitMultiplication(stopKinds: StopKind[]): boolean {
    if (this.isAtStop(stopKinds)) {
      return false;
    }

    const token = this.peek();
    if (!token) {
      return false;
    }

    if (token.kind === 'number' || token.kind === 'leftParen' || token.kind === 'absoluteOpen') {
      return true;
    }

    return token.kind === 'operator' && token.text === '√';
  }

  private isAtStop(stopKinds: StopKind[]): boolean {
    if (this.index >= this.tokens.length) {
      return true;
    }

    const token = this.tokens[this.index];
    return token.kind === 'equals' || stopKinds.includes(token.kind as StopKind);
  }

  private matchOperator(operator: Operator): boolean {
    const token = this.peek();
    if (!token || token.kind !== 'operator' || token.text !== operator) {
      return false;
    }
    this.advance();
    return true;
  }

  private matchKind(kind: Token['kind']): boolean {
    const token = this.peek();
    if (!token || token.kind !== kind) {
      return false;
    }
    this.advance();
    return true;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }

  private advance(): void {
    this.index += 1;
  }

  private currentBoundary(): number {
    return this.peek()?.start ?? this.tokens.at(-1)?.end ?? 0;
  }
}

function binaryNode(
  operator: '+' | '-' | '*' | '/' | '^',
  left: MathNode,
  right: MathNode,
  operatorStart: number,
  operatorEnd: number,
): MathNode {
  return {
    kind: 'binary',
    operator,
    left,
    right,
    operatorStart,
    operatorEnd,
    start: left.start,
    end: right.end,
  };
}

function placeholderNode(position: number): MathNode {
  return { kind: 'placeholder', start: position, end: position };
}

function renderEquationPart(part: EquationPart, options: RenderOptions): string {
  if (part.tokens.length === 0) {
    return [
      sourceSlotAt(options, part.start),
      cursorInsidePart(options.cursorIndex, part) && !cursorSuppressedAtPartBoundary(options, part) ? cursorLatex : '',
    ].join('');
  }

  return renderNode(new Parser(part.tokens).parseExpression(), 'top', suppressCursorAtPartBoundary(options, part));
}

function renderNode(node: MathNode, context: RenderContext, options: RenderOptions): string {
  switch (node.kind) {
    case 'number':
      return renderNumber(node, options);
    case 'placeholder':
      return [
        sourceSlotAt(options, node.start),
        `${cursorAt(options.cursorIndex, node.start)}${placeholderLatex}`,
      ].join('');
    case 'absolute':
      return renderAbsolute(node, options);
    case 'group':
      return renderGroup(node, context, options);
    case 'unary':
      return renderUnary(node, options);
    case 'postfix':
      return [
        renderPostfixOperand(node.value, options),
        sourceOperatorTokenAt(options, node.operatorStart, node.operatorEnd, '!'),
        cursorAt(options.cursorIndex, node.operatorEnd),
        sourceSlotAt(options, node.operatorEnd),
      ].join('');
    case 'binary':
      return renderBinary(node, context, options);
  }
}

function renderNumber(node: Extract<MathNode, { kind: 'number' }>, options: RenderOptions): string {
  if (options.editorMarkers) {
    const characters = Array.from(node.value);
    return [
      sourceSlotAt(options, node.start),
      ...characters.flatMap((character, index) => [
        sourceTokenAt(options, node.start + index, character),
        sourceSlotAt(options, node.start + index + 1),
      ]),
    ].join('');
  }

  const offset = options.cursorIndex === undefined ? -1 : options.cursorIndex - node.start;
  if (offset < 0 || offset > node.value.length) {
    return node.value;
  }

  return `${node.value.slice(0, offset)}${cursorLatex}${node.value.slice(offset)}`;
}

function renderAbsolute(node: Extract<MathNode, { kind: 'absolute' }>, options: RenderOptions): string {
  if (!options.editorMarkers) {
    return [
      cursorAt(options.cursorIndex, node.start),
      '\\left|',
      renderNode(node.value, 'absolute', options),
      node.closed ? '\\right|' : '\\right.',
      node.closed ? cursorAt(options.cursorIndex, node.end) : '',
    ].join('');
  }

  return [
    sourceSlotAt(options, node.start),
    sourceTokenAt(
      options,
      node.start,
      '|',
      'equation-source-delimiter-token',
    ),
    cursorAt(options.cursorIndex, node.start),
    renderNode(node.value, 'absolute', options),
    node.closed
      ? sourceTokenAt(
        options,
        node.end - 1,
        '|',
        'equation-source-delimiter-token',
      )
      : '',
    node.closed ? cursorAt(options.cursorIndex, node.end) : '',
    node.closed ? sourceSlotAt(options, node.end) : '',
  ].join('');
}

function renderUnary(node: Extract<MathNode, { kind: 'unary' }>, options: RenderOptions): string {
  if (node.operator === '√') {
    return [
      sourceSlotAt(options, node.operatorStart),
      sourceTokenAnchorAt(options, node.operatorStart, 'equation-source-root-token'),
      cursorAt(options.cursorIndex, node.operatorStart),
      '\\sqrt{',
      renderNode(node.value, 'sqrt', options),
      '}',
    ].join('');
  }

  return [
    sourceSlotAt(options, node.operatorStart),
    cursorAt(options.cursorIndex, node.operatorStart),
    sourceTokenAt(options, node.operatorStart, '-'),
    renderUnaryOperand(node.value, options),
  ].join('');
}

function renderBinary(node: Extract<MathNode, { kind: 'binary' }>, context: RenderContext, options: RenderOptions): string {
  switch (node.operator) {
    case '+':
    case '-': {
      const expression = [
        renderNode(node.left, 'top', options),
        ` ${sourceOperatorTokenAt(options, node.operatorStart, node.operatorEnd, node.operator)} `,
        renderNode(node.right, 'top', options),
      ].join('');
      return needsWrappedAddition(context) ? `\\left(${expression}\\right)` : expression;
    }
    case '*':
      return [
        renderMultiplicationOperand(node.left, options),
        ` ${sourceOperatorTokenAt(options, node.operatorStart, node.operatorEnd, '\\cdot')} `,
        renderMultiplicationOperand(node.right, options),
      ].join('');
    case '/':
      return renderFraction(node, options);
    case '^':
      return [
        renderPowerBase(node.left, options),
        sourcePowerTokenAt(options, node.operatorStart, node.operatorEnd),
        `^{${renderNode(node.right, 'exponent', options)}}`,
      ].join('');
  }
}

function sourceOperatorFractionTokenAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource' | 'suppressedSourceSlots'>,
  start: number,
  end: number,
  latex: string,
  fractionStart: number,
  fractionEnd: number,
): string {
  const fractionToken = sourceOperatorTokenAt(
    options,
    start,
    end,
    latex,
    fractionClassName(options, start, fractionStart, fractionEnd),
  );

  return options.editorMarkers
    ? [
      sourceSlotAt(options, fractionStart),
      fractionToken,
      sourceSlotAt(options, fractionEnd),
    ].join('')
    : fractionToken;
}

function fractionClassName(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource'>,
  dividerIndex: number,
  fractionStart: number,
  fractionEnd: number,
): string {
  const hasSelectionInRange = options.editorMarkers
    ? isSelectedSourceInRange(options.selectedSource, fractionStart, fractionEnd)
    : false;
  const isDividerSelected =
    options.editorMarkers && options.selectedSource?.kind === 'token' && options.selectedSource.index === dividerIndex;

  return [
    'equation-source-fraction-token',
    hasSelectionInRange ? 'equation-source-fraction-selected' : '',
    isDividerSelected ? 'equation-source-fraction-divider-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function renderFraction(node: Extract<MathNode, { kind: 'binary' }>, options: RenderOptions): string {
  if (node.left.kind === 'unary' && node.left.operator === '-') {
    const fractionStart = node.left.value.start;
    const fractionOptions = suppressSourceSlots(options, [fractionStart, node.end]);
    const numerator = [
      sourceSlotAt(options, fractionStart, 'fractionNumeratorStart'),
      renderNode(node.left.value, 'fraction', fractionOptions),
    ].join('');
    const denominator = [
      renderNode(node.right, 'fraction', fractionOptions),
      sourceSlotAt(options, node.end, 'fractionDenominatorEnd'),
    ].join('');
    return [
      sourceSlotAt(options, node.left.operatorStart),
      cursorAt(options.cursorIndex, node.left.operatorStart),
      sourceTokenAt(options, node.left.operatorStart, '-'),
      sourceOperatorFractionTokenAt(
        options,
        node.operatorStart,
        node.operatorEnd,
        `\\frac{${numerator}}{${denominator}}`,
        fractionStart,
        node.end,
      ),
    ].join('');
  }

  const fractionOptions = suppressSourceSlots(options, [node.start, node.end]);
  const numerator = [
    sourceSlotAt(options, node.start, 'fractionNumeratorStart'),
    renderNode(node.left, 'fraction', fractionOptions),
  ].join('');
  const denominator = [
    renderNode(node.right, 'fraction', fractionOptions),
    sourceSlotAt(options, node.end, 'fractionDenominatorEnd'),
  ].join('');
  return sourceOperatorFractionTokenAt(
    options,
    node.operatorStart,
    node.operatorEnd,
    `\\frac{${numerator}}{${denominator}}`,
    node.start,
    node.end,
  );
}

function suppressSourceSlots(options: RenderOptions, positions: number[]): RenderOptions {
  if (!options.editorMarkers) {
    return options;
  }

  return {
    ...options,
    suppressedSourceSlots: new Set([
      ...(options.suppressedSourceSlots ?? []),
      ...positions,
    ]),
  };
}

function isSelectedSourceInRange(selectedSource: SourceSelection | undefined, start: number, end: number): boolean {
  if (!selectedSource) return false;
  if (selectedSource.kind === 'token') {
    return selectedSource.index >= start && selectedSource.index < end;
  }

  if (selectedSource.placement) {
    return selectedSource.index >= start && selectedSource.index <= end;
  }

  return selectedSource.index > start && selectedSource.index < end;
}

function renderGroup(node: Extract<MathNode, { kind: 'group' }>, context: RenderContext, options: RenderOptions): string {
  const rendered = renderNode(node.value, 'top', options);

  if (options.editorMarkers || options.preserveDelimiters || node.value.kind === 'placeholder') {
    if (!options.editorMarkers) {
      return [
        cursorAt(options.cursorIndex, node.start),
        '\\left(',
        rendered,
        node.closed ? '\\right)' : '\\right.',
        node.closed ? cursorAt(options.cursorIndex, node.end) : '',
      ].join('');
    }

    return [
      sourceSlotAt(options, node.start),
      sourceTokenAt(
        options,
        node.start,
        '(',
        'equation-source-delimiter-token',
      ),
      cursorAt(options.cursorIndex, node.start),
      rendered,
      node.closed
        ? sourceTokenAt(
          options,
          node.end - 1,
          ')',
          'equation-source-delimiter-token',
        )
        : '',
      node.closed ? cursorAt(options.cursorIndex, node.end) : '',
      node.closed ? sourceSlotAt(options, node.end) : '',
    ].join('');
  }

  if (context === 'fraction' || context === 'exponent' || context === 'sqrt' || context === 'absolute' || context === 'top') {
    return `${cursorAt(options.cursorIndex, node.start)}${rendered}${cursorAt(options.cursorIndex, node.end)}`;
  }

  if (needsVisibleGroup(node.value)) {
    return `\\left(${rendered}\\right)`;
  }

  return rendered;
}

function renderMultiplicationOperand(node: MathNode, options: RenderOptions): string {
  if (node.kind === 'binary' && (node.operator === '+' || node.operator === '-')) {
    return `\\left(${renderNode(node, 'top', options)}\\right)`;
  }

  return renderNode(node, 'multiplication', options);
}

function renderUnaryOperand(node: MathNode, options: RenderOptions): string {
  if (node.kind === 'binary') {
    return `\\left(${renderNode(node, 'top', options)}\\right)`;
  }

  return renderNode(node, 'top', options);
}

function renderPostfixOperand(node: MathNode, options: RenderOptions): string {
  if (node.kind === 'binary') {
    return `\\left(${renderNode(node, 'top', options)}\\right)`;
  }

  return renderNode(node, 'postfix', options);
}

function renderPowerBase(node: MathNode, options: RenderOptions): string {
  if (node.kind === 'number' || node.kind === 'placeholder' || node.kind === 'absolute' || node.kind === 'postfix') {
    return renderNode(node, 'base', options);
  }

  if (node.kind === 'group') {
    const rendered = renderNode(node.value, 'top', options);
    return options.preserveDelimiters || needsVisibleGroup(node.value) ? `\\left(${rendered}\\right)` : rendered;
  }

  if (node.kind === 'unary' && node.operator === '√') {
    return renderNode(node, 'base', options);
  }

  return `\\left(${renderNode(node, 'top', options)}\\right)`;
}

function needsWrappedAddition(context: RenderContext): boolean {
  return context === 'multiplication' || context === 'base' || context === 'postfix';
}

function needsVisibleGroup(node: MathNode): boolean {
  return node.kind === 'binary' && (node.operator === '+' || node.operator === '-' || node.operator === '*');
}

function cursorAt(cursorIndex: number | undefined, position: number): string {
  return cursorIndex === position ? cursorLatex : '';
}

function sourceSlotAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource' | 'suppressedSourceSlots'>,
  position: number,
  placement?: SlotPlacement,
): string {
  if (!placement && options.suppressedSourceSlots?.has(position)) {
    return '';
  }

  return options.editorMarkers
    ? htmlClass(sourceClassNames(options, 'slot', position, placement), markerLatex)
    : '';
}

function sourceTokenAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource'>,
  position: number,
  latex: string,
  extraClass = '',
): string {
  if (!options.editorMarkers) {
    return latex;
  }

  const classes = [sourceClassNames(options, 'token', position), extraClass]
    .filter(Boolean)
    .join(' ');
  return htmlClass(classes, latex);
}

function sourceTokenAnchorAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource'>,
  position: number,
  extraClass = '',
): string {
  return options.editorMarkers ? sourceTokenAt(options, position, markerLatex, extraClass) : '';
}

function sourceOperatorTokenAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource'>,
  start: number,
  end: number,
  latex: string,
  extraClass = '',
): string {
  return end > start ? sourceTokenAt(options, start, latex, extraClass) : latex;
}

function sourcePowerTokenAt(
  options: Pick<RenderOptions, 'editorMarkers' | 'selectedSource'>,
  start: number,
  end: number,
): string {
  return options.editorMarkers
    ? sourceOperatorTokenAt(options, start, end, markerLatex, 'equation-source-power-token')
    : '';
}

function sourceClassNames(
  options: Pick<RenderOptions, 'selectedSource'>,
  kind: SourceSelection['kind'],
  index: number,
  placement?: SlotPlacement,
): string {
  return [
    `equation-source-${kind}`,
    `equation-source-${kind}-${index}`,
    placement ? slotPlacementClassName(placement) : '',
    selectionsMatchSource(options.selectedSource, kind, index, placement) ? 'equation-source-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function slotPlacementClassName(placement: SlotPlacement): string {
  return `equation-source-slot-placement-${kebabCase(placement)}`;
}

function selectionsMatchSource(
  selectedSource: SourceSelection | undefined,
  kind: SourceSelection['kind'],
  index: number,
  placement?: SlotPlacement,
): boolean {
  if (selectedSource?.kind !== kind || selectedSource.index !== index) {
    return false;
  }

  if (selectedSource.kind === 'token') {
    return true;
  }

  return (selectedSource.placement ?? null) === (placement ?? null);
}

function htmlClass(className: string, latex: string): string {
  return `\\htmlClass{${className}}{${latex}}`;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function clampCursorIndex(cursorIndex: number | undefined, maximum: number): number | undefined {
  if (cursorIndex === undefined) {
    return undefined;
  }
  return Math.min(Math.max(cursorIndex, 0), maximum);
}

function cursorInsidePart(cursorIndex: number | undefined, part: EquationPart): boolean {
  return cursorIndex !== undefined && cursorIndex >= part.start && cursorIndex <= part.end;
}

function suppressCursorAtPartBoundary(options: RenderOptions, part: EquationPart): RenderOptions {
  return cursorSuppressedAtPartBoundary(options, part)
    ? { ...options, cursorIndex: undefined }
    : options;
}

function cursorSuppressedAtPartBoundary(options: RenderOptions, part: EquationPart): boolean {
  return Boolean(
    (options.suppressStartCursor && options.cursorIndex === part.start) ||
    (options.suppressEndCursor && options.cursorIndex === part.end)
  );
}
