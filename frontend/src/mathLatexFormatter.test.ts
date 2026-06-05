import { describe, expect, test } from 'vitest';
import { equationToLatex, equationTokensToLatex } from './mathLatexFormatter';

const cursorLatex = '\\htmlClass{equation-cursor-marker}{\\vphantom{0}}';

function cursorCount(value: string): number {
  return value.split(cursorLatex).length - 1;
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
