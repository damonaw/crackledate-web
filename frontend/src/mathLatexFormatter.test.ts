import { describe, expect, test } from 'vitest';
import katex from 'katex';
import { equationToLatex, equationTokensToLatex } from './mathLatexFormatter';

const cursorLatex = '\\htmlClass{equation-cursor-marker}{\\vphantom{0}}';

function cursorCount(value: string): number {
  return value.split(cursorLatex).length - 1;
}

function katexErrorCount(latex: string): number {
  return katex.renderToString(latex, {
    strict: 'ignore',
    throwOnError: false,
    trust: true,
  }).split('katex-error').length - 1;
}

describe('equationToLatex', () => {
  test('formats simple division as a fraction', () => {
    expect(equationToLatex('516÷202')).toBe('\\frac{516}{202}');
  });

  test('formats grouped numerator and exponent denominator', () => {
    expect(equationToLatex('(1-2)/(2^3)')).toBe('\\frac{1 - 2}{2^{3}}');
  });

  test('formats complex division with exponent and square root', () => {
    expect(equationToLatex('51^2÷√6')).toBe('\\frac{51^{2}}{\\sqrt{6}}');
  });

  test('formats multiple divisions as nested fractions', () => {
    expect(equationToLatex('5÷1÷6÷2')).toBe('\\frac{\\frac{\\frac{5}{1}}{6}}{2}');
  });

  test('formats equation sides and operators', () => {
    expect(equationToLatex('5+√16=2^0+2+6')).toBe('5 + \\sqrt{16} = 2^{0} + 2 + 6');
  });

  test('formats implicit multiplication before an unfinished square root', () => {
    expect(equationToLatex('5√')).toBe('5 \\cdot \\sqrt{\\phantom{0}}');
  });

  test('formats absolute values inside fractions', () => {
    expect(equationToLatex('|5|÷1')).toBe('\\frac{\\left|5\\right|}{1}');
  });

  test('renders one cursor inside an empty absolute value pair', () => {
    const latex = equationToLatex('||', { cursorIndex: 1 });

    expect(latex).toBe(`\\left|${cursorLatex}\\phantom{0}\\right|`);
    expect(cursorCount(latex)).toBe(1);
  });

  test('renders visible empty parentheses while editing', () => {
    expect(equationToLatex('()', { cursorIndex: 1 })).toBe(
      `\\left(${cursorLatex}\\phantom{0}\\right)`,
    );
  });

  test('keeps cursor when redundant parentheses are visually dropped', () => {
    expect(equationToLatex('(5)', { cursorIndex: 0 })).toBe(`${cursorLatex}5`);
    expect(equationToLatex('(5)', { cursorIndex: 3 })).toBe(`5${cursorLatex}`);
  });

  test('preserves typed parentheses for the live editor', () => {
    expect(equationToLatex('(5)', { cursorIndex: 0, preserveDelimiters: true })).toBe(
      `${cursorLatex}\\left(5\\right)`,
    );
    expect(equationToLatex('(5)', { cursorIndex: 3, preserveDelimiters: true })).toBe(
      `\\left(5\\right)${cursorLatex}`,
    );
  });

  test('renders one cursor after deleting a typed closing parenthesis', () => {
    const latex = equationTokensToLatex([
      { value: '6' },
      { value: '×' },
      { value: '(' },
      { value: '4' },
      { value: '2' },
    ], { cursorIndex: 5, preserveDelimiters: true });

    expect(latex).toBe(`6 \\cdot \\left(42${cursorLatex}\\right.`);
    expect(cursorCount(latex)).toBe(1);
  });

  test('renders one cursor after deleting a typed closing absolute value', () => {
    const latex = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
    ], { cursorIndex: 2, preserveDelimiters: true });

    expect(latex).toBe(`\\left|5${cursorLatex}\\right.`);
    expect(cursorCount(latex)).toBe(1);
  });

  test('keeps grouping when implicit multiplication needs it', () => {
    expect(equationToLatex('5(1+2)')).toBe('5 \\cdot \\left(1 + 2\\right)');
  });

  test('drops exponent parentheses around fractions', () => {
    expect(equationToLatex('5^(1/6)')).toBe('5^{\\frac{1}{6}}');
  });

  test('preserves exponent parentheses around fractions for the live editor', () => {
    expect(equationToLatex('5^(1/6)', { preserveDelimiters: true })).toBe(
      '5^{\\left(\\frac{1}{6}\\right)}',
    );
  });

  test('uses explicit absolute open and close tokens for the live editor', () => {
    expect(equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
      { value: '|', role: 'absoluteClose' },
      { value: '÷' },
      { value: '1' },
    ])).toBe('\\frac{\\left|5\\right|}{1}');
  });

  test('marks fraction source tokens and slots for editor hit testing', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true });

    expect(latex).toContain('equation-source-token-0');
    expect(latex).toContain('equation-source-token-1');
    expect(latex).toContain('equation-source-token-2');
    expect(latex).toContain('equation-source-slot-0');
    expect(latex).toContain('equation-source-slot-1');
    expect(latex).toContain('equation-source-slot-2');
    expect(latex).toContain('equation-source-slot-3');
    expect(latex).toContain('equation-source-fraction-token');
  });

  test('keeps distinct whole-fraction and internal fraction edge slots in editor rendering', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 0 } });

    expect((latex.match(/equation-source-slot-0/g) ?? []).length).toBe(2);
    expect((latex.match(/equation-source-slot-3/g) ?? []).length).toBe(2);
    expect(latex).toContain('equation-source-slot-placement-fraction-numerator-start');
    expect(latex).toContain('equation-source-slot-placement-fraction-denominator-end');
    expect(latex.indexOf('equation-source-slot-0 equation-source-selected')).toBeLessThan(
      latex.indexOf('equation-source-token-1'),
    );
  });

  test('selects fraction-internal edge slots separately from whole-fraction edge slots', () => {
    const selectedNumeratorStart = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 0, placement: 'fractionNumeratorStart' } });
    const selectedDenominatorEnd = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 3, placement: 'fractionDenominatorEnd' } });

    expect(selectedNumeratorStart).toContain(
      'equation-source-slot-0 equation-source-slot-placement-fraction-numerator-start equation-source-selected',
    );
    expect((selectedNumeratorStart.match(/equation-source-selected/g) ?? []).length).toBe(1);
    expect(selectedDenominatorEnd).toContain(
      'equation-source-slot-3 equation-source-slot-placement-fraction-denominator-end equation-source-selected',
    );
    expect((selectedDenominatorEnd.match(/equation-source-selected/g) ?? []).length).toBe(1);
  });

  test('renders a leading negative sign outside a fraction', () => {
    expect(equationTokensToLatex([
      { value: '-' },
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ])).toBe('-\\frac{5}{1}');
  });

  test('does not duplicate boundary slots around equals', () => {
    const latex = equationTokensToLatex([
      { value: '6' },
      { value: '+' },
      { value: '5' },
      { value: '=' },
      { value: '2' },
    ], { editorMarkers: true });

    expect((latex.match(/equation-source-slot-3/g) ?? []).length).toBe(1);
    expect((latex.match(/equation-source-slot-4/g) ?? []).length).toBe(1);
  });

  test('renders a single trailing equals insertion slot', () => {
    const latex = equationTokensToLatex([
      { value: '6' },
      { value: '=' },
    ], { editorMarkers: true });

    expect((latex.match(/equation-source-slot-2/g) ?? []).length).toBe(1);
  });

  test('keeps a selectable slot after typing an operator first', () => {
    const latex = equationTokensToLatex([
      { value: '+' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 1 } });

    expect(latex).toContain('equation-source-slot-1 equation-source-selected');
  });

  test('keeps a selectable slot after typing an operator after a number', () => {
    const latex = equationTokensToLatex([
      { value: '6' },
      { value: '+' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 2 } });

    expect(latex).toContain('equation-source-slot-2 equation-source-selected');
  });

  test('marks parenthesis source tokens and slots for editor hit testing', () => {
    const latex = equationTokensToLatex([
      { value: '(' },
      { value: '5' },
      { value: ')' },
    ], { editorMarkers: true });

    expect(latex).toContain('equation-source-delimiter-token');
    expect(latex).toContain('equation-source-token-0');
    expect(latex).toContain('equation-source-token-1');
    expect(latex).toContain('equation-source-token-2');
    expect(latex).toContain('equation-source-slot-0');
    expect(latex).toContain('equation-source-slot-1');
    expect(latex).toContain('equation-source-slot-2');
    expect(latex).toContain('equation-source-slot-3');
  });

  test('marks absolute value source tokens and slots for editor hit testing', () => {
    const latex = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
      { value: '|', role: 'absoluteClose' },
    ], { editorMarkers: true });

    expect(latex).toContain('equation-source-delimiter-token');
    expect(latex).toContain('equation-source-token-0');
    expect(latex).toContain('equation-source-token-1');
    expect(latex).toContain('equation-source-token-2');
    expect(latex).toContain('equation-source-slot-0');
    expect(latex).toContain('equation-source-slot-1');
    expect(latex).toContain('equation-source-slot-2');
    expect(latex).toContain('equation-source-slot-3');
  });

  test('marks the selected source token or slot for editor layout', () => {
    const selectedTokenLatex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 2 } });
    const selectedSlotLatex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '1' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 1 } });

    expect(selectedTokenLatex).toContain('equation-source-token-2 equation-source-selected');
    expect(selectedSlotLatex).toContain('equation-source-slot-1 equation-source-selected');
  });

  test('renders parenthesis delimiter markers without a KaTeX parse error', () => {
    const latex = equationTokensToLatex([
      { value: '(' },
      { value: '5' },
      { value: ')' },
    ], { editorMarkers: true, preserveDelimiters: true });

    expect(katexErrorCount(latex)).toBe(0);
    expect((latex.match(/equation-source-token-2/g) ?? []).length).toBe(1);
  });

  test('renders absolute value delimiter markers without a KaTeX parse error', () => {
    const latex = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
      { value: '|', role: 'absoluteClose' },
    ], { editorMarkers: true, preserveDelimiters: true });

    expect(katexErrorCount(latex)).toBe(0);
    expect((latex.match(/equation-source-token-2/g) ?? []).length).toBe(1);
  });

  test('adds fraction-selected styling when a denominator token is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 2 } });

    expect(latex).toContain('equation-source-fraction-selected');
    expect(latex).toContain('equation-source-token-2 equation-source-selected');
  });

  test('adds divider-specific styling when the fraction operator is selected', () => {
    const selectedDivider = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 1 } });
    const selectedMultiDigitDivider = equationTokensToLatex([
      { value: '5' },
      { value: '1' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 2 } });
    const selectedNumerator = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 0 } });

    expect(selectedDivider).toContain('equation-source-fraction-divider-selected');
    expect(selectedMultiDigitDivider).toContain('equation-source-fraction-divider-selected');
    expect(selectedNumerator).not.toContain('equation-source-fraction-divider-selected');
  });

  test('adds fraction-selected styling when a numerator token is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 0 } });

    expect(latex).toContain('equation-source-fraction-selected');
    expect(latex).toContain('equation-source-token-0 equation-source-selected');
  });

  test('adds fraction-selected styling when a blank numerator/denominator slot is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 1 } });

    expect(latex).toContain('equation-source-fraction-selected');
    expect(latex).toContain('equation-source-slot-1 equation-source-selected');
  });

  test('adds fraction-selected styling when the denominator blank slot inside the fraction is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 3, placement: 'fractionDenominatorEnd' } });

    expect(latex).toContain('equation-source-fraction-selected');
    expect(latex).toContain(
      'equation-source-slot-3 equation-source-slot-placement-fraction-denominator-end equation-source-selected',
    );
  });

  test('does not add fraction-selected styling when the normal slot after a fraction is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
    ], { editorMarkers: true, selectedSource: { kind: 'slot', index: 3 } });

    expect(latex).not.toContain('equation-source-fraction-selected');
    expect(latex).toContain('equation-source-slot-3 equation-source-selected');
  });

  test('does not add fraction-selected styling when the token after a fraction is selected', () => {
    const latex = equationTokensToLatex([
      { value: '5' },
      { value: '÷' },
      { value: '2' },
      { value: '=' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 3 } });

    expect(latex).not.toContain('equation-source-fraction-selected');
    expect(latex).toContain('equation-source-token-3 equation-source-selected');
  });

  test('marks selected parenthesis and absolute delimiter tokens for editor layout', () => {
    const selectedOpenParen = equationTokensToLatex([
      { value: '(' },
      { value: '5' },
      { value: ')' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 0 } });
    const selectedCloseParen = equationTokensToLatex([
      { value: '(' },
      { value: '5' },
      { value: ')' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 2 } });
    const selectedOpenAbs = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
      { value: '|', role: 'absoluteClose' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 0 } });
    const selectedCloseAbs = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
      { value: '5' },
      { value: '|', role: 'absoluteClose' },
    ], { editorMarkers: true, selectedSource: { kind: 'token', index: 2 } });

    expect(selectedOpenParen).toContain('equation-source-token-0 equation-source-selected');
    expect(selectedCloseParen).toContain('equation-source-token-2 equation-source-selected');
    expect(selectedOpenAbs).toContain('equation-source-token-0 equation-source-selected');
    expect(selectedCloseAbs).toContain('equation-source-token-2 equation-source-selected');
  });

  test('renders only one selected marker around an unfinished parenthesis', () => {
    const selectedOpenParen = equationTokensToLatex([
      { value: '(' },
    ], { editorMarkers: true, preserveDelimiters: true, selectedSource: { kind: 'token', index: 0 } });
    const selectedSlotAfterOpenParen = equationTokensToLatex([
      { value: '(' },
    ], { editorMarkers: true, preserveDelimiters: true, selectedSource: { kind: 'slot', index: 1 } });

    expect((selectedOpenParen.match(/equation-source-selected/g) ?? []).length).toBe(1);
    expect((selectedSlotAfterOpenParen.match(/equation-source-selected/g) ?? []).length).toBe(1);
  });

  test('renders only one selected marker around an unfinished absolute value', () => {
    const selectedOpenAbs = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
    ], { editorMarkers: true, preserveDelimiters: true, selectedSource: { kind: 'token', index: 0 } });
    const selectedSlotAfterOpenAbs = equationTokensToLatex([
      { value: '|', role: 'absoluteOpen' },
    ], { editorMarkers: true, preserveDelimiters: true, selectedSource: { kind: 'slot', index: 1 } });

    expect((selectedOpenAbs.match(/equation-source-selected/g) ?? []).length).toBe(1);
    expect((selectedSlotAfterOpenAbs.match(/equation-source-selected/g) ?? []).length).toBe(1);
  });

  test('renders the cursor inside the exponent when the cursor state is inside the exponent', () => {
    expect(equationToLatex('5^24÷2=0×2×6', { cursorIndex: 4 })).toBe(
      `\\frac{5^{24${cursorLatex}}}{2} = 0 \\cdot 2 \\cdot 6`,
    );
  });

  test('renders the cursor before equals when the cursor state is before equals', () => {
    expect(equationToLatex('5^24÷2=0×2×6', { cursorIndex: 6 })).toBe(
      `\\frac{5^{24}}{2}${cursorLatex} = 0 \\cdot 2 \\cdot 6`,
    );
  });

  test('renders only one cursor at expression boundaries', () => {
    expect(equationToLatex('524', { cursorIndex: 0 })).toBe(`${cursorLatex}524`);
    expect(equationToLatex('524', { cursorIndex: 3 })).toBe(`524${cursorLatex}`);
  });
});
