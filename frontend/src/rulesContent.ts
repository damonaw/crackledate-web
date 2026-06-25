export type RuleSection = {
  title: string;
  rows: string[];
};

export const RULES_SECTIONS: RuleSection[] = [
  {
    title: 'Daily Puzzle',
    rows: [
      'Use every digit in order.',
      'Add exactly one equals sign.',
      'Both sides must evaluate to the same value.',
    ],
  },
  {
    title: 'Sandbox',
    rows: [
      'Practice does not save progress.',
      'Practice does not change your streak, badges, or saved solutions.',
    ],
  },
  {
    title: 'Ads',
    rows: [
      'Archive, extra current-date solves, and future dates may use ads.',
      'Past dates can show a banner ad.',
      'The current date can show a banner ad after one saved solution.',
      'Future dates can ask for a 30-second sponsor ad.',
    ],
  },
];

export function rulesSearchableText(): string {
  return RULES_SECTIONS.map((section) => `${section.title} ${section.rows.join(' ')}`).join(' ');
}
