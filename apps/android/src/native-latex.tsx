import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  normalizeEditorSelection,
  type EditableEquationToken,
  type EditorSelection,
  type SlotPlacement,
} from '@crackledate/core';
import { styles } from './ui';

type Operator = '+' | '-' | '*' | '/' | '^' | '√' | '!';
type StopKind = 'rightParen' | 'absoluteClose';
type LatexTextSize = 'normal' | 'compact' | 'script';

type SourceDigit = {
  value: string;
  index: number;
};

type SourceToken =
  | { kind: 'number'; digits: SourceDigit[]; start: number; end: number }
  | { kind: 'operator'; text: Operator; start: number; end: number }
  | { kind: 'equals'; text: '='; start: number; end: number }
  | { kind: 'leftParen'; text: '('; start: number; end: number }
  | { kind: 'rightParen'; text: ')'; start: number; end: number }
  | { kind: 'absoluteOpen'; text: '|'; start: number; end: number }
  | { kind: 'absoluteClose'; text: '|'; start: number; end: number };

type MathNode =
  | { kind: 'number'; digits: SourceDigit[]; start: number; end: number }
  | { kind: 'placeholder'; start: number; end: number }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/' | '^';
      left: MathNode;
      right: MathNode;
      operatorStart: number;
      operatorEnd: number;
      start: number;
      end: number;
    }
  | { kind: 'unary'; operator: '-' | '√'; value: MathNode; operatorStart: number; operatorEnd: number; start: number; end: number }
  | { kind: 'postfix'; operator: '!'; value: MathNode; operatorStart: number; operatorEnd: number; start: number; end: number }
  | { kind: 'group'; value: MathNode; closed: boolean; openIndex: number; closeIndex?: number; start: number; end: number }
  | { kind: 'absolute'; value: MathNode; closed: boolean; openIndex: number; closeIndex?: number; start: number; end: number };

type EquationPart = {
  tokens: SourceToken[];
  start: number;
  end: number;
  followingEquals?: SourceToken & { kind: 'equals' };
};

type NativeLatexEquationProps = {
  tokens: EditableEquationToken[];
  selection: EditorSelection;
  isDarkMode: boolean;
  onSelectSlot: (index: number, placement?: SlotPlacement) => void;
  onSelectToken: (index: number) => void;
};

type RenderContext = {
  selected: EditorSelection;
  isDarkMode: boolean;
  onSelectSlot: (index: number, placement?: SlotPlacement) => void;
  onSelectToken: (index: number) => void;
};

type RenderOptions = {
  suppressedSlotKeys?: ReadonlySet<string>;
};

export function NativeLatexEquation({
  tokens,
  selection,
  isDarkMode,
  onSelectSlot,
  onSelectToken,
}: NativeLatexEquationProps) {
  const selected = normalizeEditorSelection(selection, tokens.length);
  const sourceTokens = tokensFromEditorTokens(tokens);
  const parts = splitEquation(sourceTokens);
  const context: RenderContext = { selected, isDarkMode, onSelectSlot, onSelectToken };

  return (
    <View style={styles.latexEquationRow}>
      {parts.map((part, partIndex) => (
        <View key={`part-${part.start}-${partIndex}`} style={styles.latexInlineGroup}>
          {renderEquationPart(part, context, 'normal', `part-${partIndex}`)}
          {part.followingEquals ? (
            <TokenButton
              tokenIndex={part.followingEquals.start}
              label="equals sign"
              context={context}
              size="normal"
              extraStyle={styles.latexEqualsToken}
            >
              <Text style={latexTextStyle(context, 'normal')}>=</Text>
            </TokenButton>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function tokensFromEditorTokens(inputTokens: EditableEquationToken[]): SourceToken[] {
  const tokens: SourceToken[] = [];

  for (let index = 0; index < inputTokens.length;) {
    const token = inputTokens[index];
    if (token && /^\d$/.test(token.value)) {
      const start = index;
      const digits: SourceDigit[] = [];
      while (index < inputTokens.length && /^\d$/.test(inputTokens[index]?.value ?? '')) {
        digits.push({ value: inputTokens[index].value, index });
        index += 1;
      }
      tokens.push({ kind: 'number', digits, start, end: index });
      continue;
    }

    const parsed = token ? sourceTokenForEditorToken(token, index) : null;
    if (parsed) {
      tokens.push(parsed);
    }
    index += 1;
  }

  return tokens;
}

function sourceTokenForEditorToken(token: EditableEquationToken, start: number): SourceToken | null {
  if (token.value === '|') {
    return {
      kind: token.role === 'absoluteClose' ? 'absoluteClose' : 'absoluteOpen',
      text: '|',
      start,
      end: start + 1,
    };
  }

  switch (token.value) {
    case '+':
      return { kind: 'operator', text: '+', start, end: start + 1 };
    case '-':
    case '−':
      return { kind: 'operator', text: '-', start, end: start + 1 };
    case '*':
    case '×':
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

function splitEquation(tokens: SourceToken[]): EquationPart[] {
  const parts: EquationPart[] = [];
  let currentTokens: SourceToken[] = [];
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

  const lastToken = currentTokens[currentTokens.length - 1];
  parts.push({
    tokens: currentTokens,
    start: partStart,
    end: lastToken?.end ?? partStart,
  });

  return parts;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: SourceToken[]) {}

  parseExpression(stopKinds: StopKind[] = []): MathNode {
    return this.parseAddSubtract(stopKinds);
  }

  private parseAddSubtract(stopKinds: StopKind[]): MathNode {
    let node = this.parseTerm(stopKinds);

    while (!this.isAtStop(stopKinds) && (this.matchOperator('+') || this.matchOperator('-'))) {
      const operatorToken = this.previousOperator();
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
        const operatorToken = this.previousOperator();
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
      const operatorToken = this.previousOperator();
      const right = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parsePower(stopKinds);
      return binaryNode('^', left, right, operatorToken.start, operatorToken.end);
    }

    return left;
  }

  private parseUnary(stopKinds: StopKind[]): MathNode {
    if (this.matchOperator('-')) {
      const operatorToken = this.previousOperator();
      const value = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parseUnary(stopKinds);
      return {
        kind: 'unary',
        operator: '-',
        value,
        operatorStart: operatorToken.start,
        operatorEnd: operatorToken.end,
        start: operatorToken.start,
        end: value.end,
      };
    }

    if (this.matchOperator('√')) {
      const operatorToken = this.previousOperator();
      const value = this.isAtStop(stopKinds) ? placeholderNode(operatorToken.end) : this.parseUnary(stopKinds);
      return {
        kind: 'unary',
        operator: '√',
        value,
        operatorStart: operatorToken.start,
        operatorEnd: operatorToken.end,
        start: operatorToken.start,
        end: value.end,
      };
    }

    return this.parsePostfix(stopKinds);
  }

  private parsePostfix(stopKinds: StopKind[]): MathNode {
    let node = this.parsePrimary(stopKinds);

    while (!this.isAtStop(stopKinds) && this.matchOperator('!')) {
      const operatorToken = this.previous();
      node = {
        kind: 'postfix',
        operator: '!',
        value: node,
        operatorStart: operatorToken.start,
        operatorEnd: operatorToken.end,
        start: node.start,
        end: operatorToken.end,
      };
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
      return { kind: 'number', digits: token.digits, start: token.start, end: token.end };
    }

    if (token.kind === 'leftParen') {
      this.advance();
      const value = this.isAtStop(['rightParen']) ? placeholderNode(token.end) : this.parseExpression(['rightParen']);
      const close = this.matchKind('rightParen') ? this.previous() : undefined;
      return {
        kind: 'group',
        value,
        closed: Boolean(close),
        openIndex: token.start,
        closeIndex: close?.start,
        start: token.start,
        end: close?.end ?? value.end,
      };
    }

    if (token.kind === 'absoluteOpen') {
      this.advance();
      const value = this.isAtStop(['absoluteClose'])
        ? placeholderNode(token.end)
        : this.parseExpression(['absoluteClose']);
      const close = this.matchKind('absoluteClose') ? this.previous() : undefined;
      return {
        kind: 'absolute',
        value,
        closed: Boolean(close),
        openIndex: token.start,
        closeIndex: close?.start,
        start: token.start,
        end: close?.end ?? value.end,
      };
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

    return token.kind === 'number' || token.kind === 'leftParen' || token.kind === 'absoluteOpen' || (token.kind === 'operator' && token.text === '√');
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

  private matchKind(kind: SourceToken['kind']): boolean {
    const token = this.peek();
    if (!token || token.kind !== kind) {
      return false;
    }
    this.advance();
    return true;
  }

  private peek(): SourceToken | undefined {
    return this.tokens[this.index];
  }

  private previous(): SourceToken {
    return this.tokens[this.index - 1];
  }

  private previousOperator(): Extract<SourceToken, { kind: 'operator' }> {
    return this.previous() as Extract<SourceToken, { kind: 'operator' }>;
  }

  private advance(): void {
    this.index += 1;
  }

  private currentBoundary(): number {
    const previous = this.tokens[this.tokens.length - 1];
    return this.peek()?.start ?? previous?.end ?? 0;
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

function renderEquationPart(
  part: EquationPart,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions = {},
): ReactNode {
  if (part.tokens.length === 0) {
    return <EquationSlot key={`${keyPrefix}-empty-slot`} index={part.start} context={context} size={size} options={options} />;
  }

  return renderNode(new Parser(part.tokens).parseExpression(), context, size, keyPrefix, options);
}

function renderNode(
  node: MathNode,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions = {},
): ReactNode {
  switch (node.kind) {
    case 'number':
      return renderNumber(node, context, size, keyPrefix, options);
    case 'placeholder':
      return (
        <View key={`${keyPrefix}-placeholder`} style={styles.latexPlaceholder}>
          <EquationSlot index={node.start} context={context} size={size} options={options} />
        </View>
      );
    case 'absolute':
      return renderAbsolute(node, context, size, keyPrefix, options);
    case 'group':
      return renderGroup(node, context, size, keyPrefix, options);
    case 'unary':
      return renderUnary(node, context, size, keyPrefix, options);
    case 'postfix':
      {
        const postfixOptions = suppressSlots(options, [{ index: node.operatorStart }]);
        return (
          <View key={`${keyPrefix}-postfix`} style={styles.latexPostfixGroup}>
            {renderNode(node.value, context, size, `${keyPrefix}-value`, postfixOptions)}
            <TokenButton
              tokenIndex={node.operatorStart}
              label="factorial operator"
              context={context}
              size={size}
              extraStyle={styles.latexPostfixOperatorToken}
            >
              <Text style={latexTextStyle(context, size)}>!</Text>
            </TokenButton>
            <EquationSlot index={node.operatorEnd} context={context} size={size} options={options} />
          </View>
        );
      }
    case 'binary':
      return renderBinary(node, context, size, keyPrefix, options);
  }
}

function renderNumber(
  node: Extract<MathNode, { kind: 'number' }>,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions,
): ReactNode {
  return (
    <View key={`${keyPrefix}-number`} style={styles.latexInlineGroup}>
      <EquationSlot index={node.start} context={context} size={size} options={options} />
      {node.digits.map((digit) => (
        <View key={`${keyPrefix}-digit-${digit.index}`} style={styles.latexInlineGroup}>
          <TokenButton tokenIndex={digit.index} label={digit.value} context={context} size={size}>
            <Text style={latexTextStyle(context, size)}>{digit.value}</Text>
          </TokenButton>
          <EquationSlot index={digit.index + 1} context={context} size={size} options={options} />
        </View>
      ))}
    </View>
  );
}

function renderBinary(
  node: Extract<MathNode, { kind: 'binary' }>,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions,
): ReactNode {
  if (node.operator === '/') {
    const selectedDivider = context.selected.kind === 'token' && context.selected.index === node.operatorStart;
    const fractionOptions = suppressSlots(options, [{ index: node.start }, { index: node.end }]);
    return (
      <View key={`${keyPrefix}-fraction-cluster`} style={styles.latexFractionCluster}>
        <EquationSlot index={node.start} context={context} size={size} options={options} />
        <View style={styles.latexFraction}>
          <View style={styles.latexFractionPart}>
            <EquationSlot
              index={node.start}
              placement="fractionNumeratorStart"
              context={context}
              size="compact"
              options={options}
              extraStyle={styles.latexFractionEdgeSlot}
            />
            {renderNode(node.left, context, 'compact', `${keyPrefix}-numerator`, fractionOptions)}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.latexFractionBarButton,
              selectedDivider && styles.selectedLatexFractionBarButton,
              pressed && styles.pressed,
            ]}
            onPress={() => context.onSelectToken(node.operatorStart)}
            accessibilityRole="button"
            accessibilityLabel="Select division fraction bar"
          >
            <View
              style={[
                styles.latexFractionBar,
                context.isDarkMode && styles.latexFractionBarOnDark,
                selectedDivider && styles.latexFractionBarSelected,
              ]}
            />
          </Pressable>
          <View style={styles.latexFractionPart}>
            {renderNode(node.right, context, 'compact', `${keyPrefix}-denominator`, fractionOptions)}
            <EquationSlot
              index={node.end}
              placement="fractionDenominatorEnd"
              context={context}
              size="compact"
              options={options}
              extraStyle={styles.latexFractionEdgeSlot}
            />
          </View>
        </View>
        <EquationSlot index={node.end} context={context} size={size} options={options} />
      </View>
    );
  }

  if (node.operator === '^') {
    const selectedPower = context.selected.kind === 'token' && context.selected.index === node.operatorStart;
    const powerOptions = suppressSlots(options, [{ index: node.operatorStart }, { index: node.operatorEnd }]);
    return (
      <View key={`${keyPrefix}-power`} style={styles.latexPowerGroup}>
        {renderNode(node.left, context, size, `${keyPrefix}-base`, powerOptions)}
        <Pressable
          style={({ pressed }) => [
            styles.latexPowerOperatorTouch,
            selectedPower && styles.selectedLatexToken,
            pressed && styles.pressed,
          ]}
          onPress={() => context.onSelectToken(node.operatorStart)}
          accessibilityRole="button"
          accessibilityLabel="Select power operator"
        >
          <Text style={[latexTextStyle(context, 'script'), styles.latexPowerOperatorText]}>
            {selectedPower ? '^' : ''}
          </Text>
        </Pressable>
        <View style={styles.latexExponent}>
          {renderNode(node.right, context, 'script', `${keyPrefix}-exponent`, powerOptions)}
        </View>
      </View>
    );
  }

  if (node.operator === '*' && node.operatorStart === node.operatorEnd) {
    return (
      <View key={`${keyPrefix}-implicit`} style={styles.latexInlineGroup}>
        {renderNode(node.left, context, size, `${keyPrefix}-left`, options)}
        {renderNode(node.right, context, size, `${keyPrefix}-right`, options)}
      </View>
    );
  }

  return (
    <View key={`${keyPrefix}-binary`} style={styles.latexInlineGroup}>
      {renderNode(node.left, context, size, `${keyPrefix}-left`, options)}
      <TokenButton
        tokenIndex={node.operatorStart}
        label={operatorAccessibilityLabel(node.operator)}
        context={context}
        size={size}
        extraStyle={styles.latexOperatorToken}
      >
        <Text style={latexTextStyle(context, size)}>{displayOperator(node.operator)}</Text>
      </TokenButton>
      {renderNode(node.right, context, size, `${keyPrefix}-right`, options)}
    </View>
  );
}

function renderUnary(
  node: Extract<MathNode, { kind: 'unary' }>,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions,
): ReactNode {
  if (node.operator === '√') {
    return (
      <View key={`${keyPrefix}-root`} style={styles.latexRootGroup}>
        <EquationSlot index={node.operatorStart} context={context} size={size} options={options} />
        <TokenButton tokenIndex={node.operatorStart} label="square root operator" context={context} size={size}>
          <Text style={[latexTextStyle(context, size), styles.latexRootSymbol]}>√</Text>
        </TokenButton>
        <View style={styles.latexRadicandGroup}>
          <View style={[styles.latexRootBar, context.isDarkMode && styles.latexRootBarOnDark]} />
          <View style={styles.latexRadicand}>{renderNode(node.value, context, 'compact', `${keyPrefix}-value`, options)}</View>
        </View>
      </View>
    );
  }

  return (
    <View key={`${keyPrefix}-unary-minus`} style={styles.latexInlineGroup}>
      <EquationSlot index={node.operatorStart} context={context} size={size} options={options} />
      <TokenButton tokenIndex={node.operatorStart} label="minus operator" context={context} size={size}>
        <Text style={latexTextStyle(context, size)}>−</Text>
      </TokenButton>
      {renderNode(node.value, context, size, `${keyPrefix}-value`, options)}
    </View>
  );
}

function renderGroup(
  node: Extract<MathNode, { kind: 'group' }>,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions,
): ReactNode {
  return (
    <View key={`${keyPrefix}-group`} style={styles.latexInlineGroup}>
      <EquationSlot index={node.openIndex} context={context} size={size} options={options} />
      <TokenButton tokenIndex={node.openIndex} label="open parenthesis" context={context} size={size}>
        <Text style={latexTextStyle(context, size)}>(</Text>
      </TokenButton>
      {renderNode(node.value, context, size, `${keyPrefix}-value`, options)}
      {node.closed && node.closeIndex !== undefined ? (
        <TokenButton tokenIndex={node.closeIndex} label="close parenthesis" context={context} size={size}>
          <Text style={latexTextStyle(context, size)}>)</Text>
        </TokenButton>
      ) : null}
      {node.closed ? <EquationSlot index={node.end} context={context} size={size} options={options} /> : null}
    </View>
  );
}

function renderAbsolute(
  node: Extract<MathNode, { kind: 'absolute' }>,
  context: RenderContext,
  size: LatexTextSize,
  keyPrefix: string,
  options: RenderOptions,
): ReactNode {
  return (
    <View key={`${keyPrefix}-absolute`} style={styles.latexInlineGroup}>
      <EquationSlot index={node.openIndex} context={context} size={size} options={options} />
      <TokenButton tokenIndex={node.openIndex} label="absolute value open" context={context} size={size}>
        <Text style={latexTextStyle(context, size)}>|</Text>
      </TokenButton>
      {renderNode(node.value, context, size, `${keyPrefix}-value`, options)}
      {node.closed && node.closeIndex !== undefined ? (
        <TokenButton tokenIndex={node.closeIndex} label="absolute value close" context={context} size={size}>
          <Text style={latexTextStyle(context, size)}>|</Text>
        </TokenButton>
      ) : null}
      {node.closed ? <EquationSlot index={node.end} context={context} size={size} options={options} /> : null}
    </View>
  );
}

function TokenButton({
  tokenIndex,
  label,
  context,
  size,
  children,
  extraStyle,
}: {
  tokenIndex: number;
  label: string;
  context: RenderContext;
  size: LatexTextSize;
  children: ReactNode;
  extraStyle?: object;
}) {
  const selected = context.selected.kind === 'token' && context.selected.index === tokenIndex;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.latexTokenPressable,
        size === 'script' && styles.latexTokenPressableScript,
        extraStyle,
        selected && styles.selectedLatexToken,
        pressed && styles.pressed,
      ]}
      onPress={() => context.onSelectToken(tokenIndex)}
      accessibilityRole="button"
      accessibilityLabel={`Select ${label}`}
    >
      {children}
    </Pressable>
  );
}

function EquationSlot({
  index,
  context,
  size,
  placement,
  options,
  extraStyle,
}: {
  index: number;
  context: RenderContext;
  size: LatexTextSize;
  placement?: SlotPlacement;
  options: RenderOptions;
  extraStyle?: object;
}) {
  if (isSuppressedSlot(options, index, placement)) {
    return null;
  }
  const selected = selectionMatchesLatexSlot(context.selected, index, placement);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.latexSlot,
        size === 'script' && styles.latexSlotScript,
        size === 'compact' && styles.latexSlotCompact,
        extraStyle,
        selected && styles.selectedLatexSlot,
        pressed && styles.pressed,
      ]}
      hitSlop={8}
      onPress={() => context.onSelectSlot(index, placement)}
      accessibilityRole="button"
      accessibilityLabel={slotAccessibilityLabel(index, placement)}
    >
      {selected ? (
        <Text
          style={[
            styles.latexCursor,
            size === 'script' && styles.latexCursorScript,
            context.isDarkMode && styles.equationCursorOnDark,
          ]}
        >
          |
        </Text>
      ) : null}
    </Pressable>
  );
}

export function selectionMatchesLatexSlot(
  selected: EditorSelection,
  index: number,
  placement?: SlotPlacement,
): boolean {
  if (selected.kind !== 'slot' || selected.index !== index) {
    return false;
  }

  return (selected.placement ?? null) === (placement ?? null);
}

function suppressSlots(options: RenderOptions, slots: { index: number; placement?: SlotPlacement }[]): RenderOptions {
  const suppressedSlotKeys = new Set(options.suppressedSlotKeys ?? []);
  for (const slot of slots) {
    suppressedSlotKeys.add(slotKey(slot.index, slot.placement));
  }
  return { ...options, suppressedSlotKeys };
}

function isSuppressedSlot(options: RenderOptions, index: number, placement?: SlotPlacement): boolean {
  return options.suppressedSlotKeys?.has(slotKey(index, placement)) ?? false;
}

function slotKey(index: number, placement?: SlotPlacement): string {
  return `${index}:${placement ?? 'source'}`;
}

function slotAccessibilityLabel(index: number, placement?: SlotPlacement): string {
  if (placement === 'fractionNumeratorStart') {
    return `Select fraction numerator start slot ${index + 1}`;
  }
  if (placement === 'fractionDenominatorEnd') {
    return `Select fraction denominator end slot ${index + 1}`;
  }
  return `Select equation slot ${index + 1}`;
}

function latexTextStyle(context: RenderContext, size: LatexTextSize) {
  return [
    styles.latexText,
    size === 'compact' && styles.latexCompactText,
    size === 'script' && styles.latexScriptText,
    context.isDarkMode && styles.equationTextOnDark,
  ];
}

function displayOperator(operator: '+' | '-' | '*'): string {
  if (operator === '-') return '−';
  if (operator === '*') return '·';
  return '+';
}

function operatorAccessibilityLabel(operator: '+' | '-' | '*'): string {
  if (operator === '-') return 'minus operator';
  if (operator === '*') return 'multiplication operator';
  return 'plus operator';
}
