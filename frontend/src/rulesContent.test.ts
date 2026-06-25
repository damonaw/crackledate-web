import { describe, expect, test } from 'vitest';
import { RULES_SECTIONS, rulesSearchableText } from './rulesContent';

describe('rulesContent', () => {
  test('matches the Android written rules sections', () => {
    expect(RULES_SECTIONS.map((section) => section.title)).toEqual([
      'Daily Puzzle',
      'Sandbox',
      'Ads',
    ]);

    const text = rulesSearchableText();
    expect(text).toContain('Use every digit in order.');
    expect(text).toContain('Use 0+26 rather than 026.');
    expect(text).toContain('Add exactly one equals sign.');
    expect(text).toContain('Practice does not save progress.');
    expect(text).toContain('Past dates can show a banner ad.');
    expect(text).toContain('Future dates can ask for a 30-second sponsor ad.');
  });
});
