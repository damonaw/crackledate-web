export type RuleSection = {
  title: string;
  rows: string[];
};

export const RULES_SECTIONS: RuleSection[] = [
  {
    title: 'Daily Puzzle',
    rows: [
      'Use every digit in order.',
      'Use 0+26 rather than 026.',
      'Add exactly one equals sign.',
      'Both sides must evaluate to the same value.',
    ],
  },
  {
    title: 'Sandbox',
    rows: [
      'Practice does not save progress.',
      'Practice does not change your streak or Calendar history.',
    ],
  },
  {
    title: 'Access',
    rows: [
      'Past, current, and future dates open without ads or purchases.',
    ],
  },
];

export function rulesSearchableText(): string {
  return RULES_SECTIONS.map((section) => `${section.title} ${section.rows.join(' ')}`).join(' ');
}
