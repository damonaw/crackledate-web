type Token =
  | { kind: 'number'; text: string }
  | { kind: 'operator'; text: Operator }
  | { kind: 'equals'; text: '=' }
  | { kind: 'leftParen'; text: '(' }
  | { kind: 'rightParen'; text: ')' }
  | { kind: 'pipe'; text: '|' };

type Operator = '+' | '-' | '*' | '/' | '^' | '√' | '!';
type StopKind = 'rightParen' | 'pipe';

type MathNode =
  | { kind: 'number'; value: string }
  | { kind: 'placeholder' }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: MathNode; right: MathNode }
  | { kind: 'unary'; operator: '-' | '√'; value: MathNode }
  | { kind: 'postfix'; operator: '!'; value: MathNode }
  | { kind: 'group'; value: MathNode }
  | { kind: 'absolute'; value: MathNode };

type RenderContext = 'top' | 'fraction' | 'exponent' | 'sqrt' | 'absolute' | 'multiplication' | 'base' | 'postfix';

const placeholderLatex = '\\phantom{0}';

export function equationToLatex(expression: string): string {
  const tokens = tokenize(expression);
  if (tokens.length === 0) {
    return placeholderLatex;
  }

  return splitEquation(tokens)
    .map((part) => {
      if (part.length === 0) {
        return '';
      }
      return renderNode(new Parser(part).parseExpression(), 'top');
    })
    .join(' = ');
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const characters = Array.from(input);

  for (let index = 0; index < characters.length;) {
    const character = characters[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character)) {
      let text = character;
      index += 1;
      while (index < characters.length && /\d/.test(characters[index])) {
        text += characters[index];
        index += 1;
      }
      tokens.push({ kind: 'number', text });
      continue;
    }

    switch (character) {
      case '+':
        tokens.push({ kind: 'operator', text: '+' });
        break;
      case '-':
      case '−':
        tokens.push({ kind: 'operator', text: '-' });
        break;
      case '*':
      case '×':
      case 'x':
      case 'X':
        tokens.push({ kind: 'operator', text: '*' });
        break;
      case '/':
      case '÷':
        tokens.push({ kind: 'operator', text: '/' });
        break;
      case '^':
        tokens.push({ kind: 'operator', text: '^' });
        break;
      case '√':
        tokens.push({ kind: 'operator', text: '√' });
        break;
      case '!':
        tokens.push({ kind: 'operator', text: '!' });
        break;
      case '(':
        tokens.push({ kind: 'leftParen', text: '(' });
        break;
      case ')':
        tokens.push({ kind: 'rightParen', text: ')' });
        break;
      case '|':
        tokens.push({ kind: 'pipe', text: '|' });
        break;
      case '=':
        tokens.push({ kind: 'equals', text: '=' });
        break;
      default:
        break;
    }

    index += 1;
  }

  return tokens;
}

function splitEquation(tokens: Token[]): Token[][] {
  const parts: Token[][] = [[]];

  for (const token of tokens) {
    if (token.kind === 'equals') {
      parts.push([]);
      continue;
    }
    parts[parts.length - 1].push(token);
  }

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
      const operator = this.previous().text as '+' | '-';
      const right = this.isAtStop(stopKinds) ? placeholderNode() : this.parseTerm(stopKinds);
      node = { kind: 'binary', operator, left: node, right };
    }

    return node;
  }

  private parseTerm(stopKinds: StopKind[]): MathNode {
    let node = this.parsePower(stopKinds);

    while (!this.isAtStop(stopKinds)) {
      if (this.matchOperator('*') || this.matchOperator('/')) {
        const operator = this.previous().text as '*' | '/';
        const right = this.isAtStop(stopKinds) ? placeholderNode() : this.parsePower(stopKinds);
        node = { kind: 'binary', operator, left: node, right };
        continue;
      }

      if (this.startsImplicitMultiplication(stopKinds)) {
        node = { kind: 'binary', operator: '*', left: node, right: this.parsePower(stopKinds) };
        continue;
      }

      break;
    }

    return node;
  }

  private parsePower(stopKinds: StopKind[]): MathNode {
    const left = this.parseUnary(stopKinds);

    if (this.matchOperator('^')) {
      const right = this.isAtStop(stopKinds) ? placeholderNode() : this.parsePower(stopKinds);
      return { kind: 'binary', operator: '^', left, right };
    }

    return left;
  }

  private parseUnary(stopKinds: StopKind[]): MathNode {
    if (this.matchOperator('-')) {
      const value = this.isAtStop(stopKinds) ? placeholderNode() : this.parseUnary(stopKinds);
      return { kind: 'unary', operator: '-', value };
    }

    if (this.matchOperator('√')) {
      const value = this.isAtStop(stopKinds) ? placeholderNode() : this.parseUnary(stopKinds);
      return { kind: 'unary', operator: '√', value };
    }

    return this.parsePostfix(stopKinds);
  }

  private parsePostfix(stopKinds: StopKind[]): MathNode {
    let node = this.parsePrimary(stopKinds);

    while (!this.isAtStop(stopKinds) && this.matchOperator('!')) {
      node = { kind: 'postfix', operator: '!', value: node };
    }

    return node;
  }

  private parsePrimary(stopKinds: StopKind[]): MathNode {
    if (this.isAtStop(stopKinds)) {
      return placeholderNode();
    }

    const token = this.peek();
    if (!token) {
      return placeholderNode();
    }

    if (token.kind === 'number') {
      this.advance();
      return { kind: 'number', value: token.text };
    }

    if (token.kind === 'leftParen') {
      this.advance();
      const value = this.isAtStop(['rightParen']) ? placeholderNode() : this.parseExpression(['rightParen']);
      this.matchKind('rightParen');
      return { kind: 'group', value };
    }

    if (token.kind === 'pipe') {
      this.advance();
      const value = this.isAtStop(['pipe']) ? placeholderNode() : this.parseExpression(['pipe']);
      this.matchKind('pipe');
      return { kind: 'absolute', value };
    }

    this.advance();
    return placeholderNode();
  }

  private startsImplicitMultiplication(stopKinds: StopKind[]): boolean {
    if (this.isAtStop(stopKinds)) {
      return false;
    }

    const token = this.peek();
    if (!token) {
      return false;
    }

    if (token.kind === 'number' || token.kind === 'leftParen' || token.kind === 'pipe') {
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
}

function placeholderNode(): MathNode {
  return { kind: 'placeholder' };
}

function renderNode(node: MathNode, context: RenderContext): string {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'placeholder':
      return placeholderLatex;
    case 'absolute':
      return `\\left|${renderNode(node.value, 'absolute')}\\right|`;
    case 'group':
      return renderGroup(node.value, context);
    case 'unary':
      if (node.operator === '√') {
        return `\\sqrt{${renderNode(node.value, 'sqrt')}}`;
      }
      return `-${renderUnaryOperand(node.value)}`;
    case 'postfix':
      return `${renderPostfixOperand(node.value)}!`;
    case 'binary':
      return renderBinary(node, context);
  }
}

function renderBinary(node: Extract<MathNode, { kind: 'binary' }>, context: RenderContext): string {
  switch (node.operator) {
    case '+':
    case '-': {
      const expression = `${renderNode(node.left, 'top')} ${node.operator} ${renderNode(node.right, 'top')}`;
      return needsWrappedAddition(context) ? `\\left(${expression}\\right)` : expression;
    }
    case '*':
      return `${renderMultiplicationOperand(node.left)} \\cdot ${renderMultiplicationOperand(node.right)}`;
    case '/':
      return `\\frac{${renderNode(node.left, 'fraction')}}{${renderNode(node.right, 'fraction')}}`;
    case '^':
      return `${renderPowerBase(node.left)}^{${renderNode(node.right, 'exponent')}}`;
  }
}

function renderGroup(value: MathNode, context: RenderContext): string {
  const rendered = renderNode(value, 'top');

  if (context === 'fraction' || context === 'exponent' || context === 'sqrt' || context === 'absolute' || context === 'top') {
    return rendered;
  }

  if (needsVisibleGroup(value)) {
    return `\\left(${rendered}\\right)`;
  }

  return rendered;
}

function renderMultiplicationOperand(node: MathNode): string {
  if (node.kind === 'binary' && (node.operator === '+' || node.operator === '-')) {
    return `\\left(${renderNode(node, 'top')}\\right)`;
  }

  return renderNode(node, 'multiplication');
}

function renderUnaryOperand(node: MathNode): string {
  if (node.kind === 'binary') {
    return `\\left(${renderNode(node, 'top')}\\right)`;
  }

  return renderNode(node, 'top');
}

function renderPostfixOperand(node: MathNode): string {
  if (node.kind === 'binary') {
    return `\\left(${renderNode(node, 'top')}\\right)`;
  }

  return renderNode(node, 'postfix');
}

function renderPowerBase(node: MathNode): string {
  if (node.kind === 'number' || node.kind === 'placeholder' || node.kind === 'absolute' || node.kind === 'postfix') {
    return renderNode(node, 'base');
  }

  if (node.kind === 'group') {
    const rendered = renderNode(node.value, 'top');
    return needsVisibleGroup(node.value) ? `\\left(${rendered}\\right)` : rendered;
  }

  if (node.kind === 'unary' && node.operator === '√') {
    return renderNode(node, 'base');
  }

  return `\\left(${renderNode(node, 'top')}\\right)`;
}

function needsWrappedAddition(context: RenderContext): boolean {
  return context === 'multiplication' || context === 'base' || context === 'postfix';
}

function needsVisibleGroup(node: MathNode): boolean {
  return node.kind === 'binary' && (node.operator === '+' || node.operator === '-' || node.operator === '*');
}
