import { describe, expect, test } from 'vitest';
import { equationToLatex } from './mathLatexFormatter';

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

  test('keeps grouping when implicit multiplication needs it', () => {
    expect(equationToLatex('5(1+2)')).toBe('5 \\cdot \\left(1 + 2\\right)');
  });

  test('drops exponent parentheses around fractions', () => {
    expect(equationToLatex('5^(1/6)')).toBe('5^{\\frac{1}{6}}');
  });
});
