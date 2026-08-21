export type HowToPlaySection = {
  title: string;
  items: string[];
};

export const HOW_TO_PLAY_SECTIONS: HowToPlaySection[] = [
  {
    title: 'Build an equation',
    items: [
      'Tap the blue number to add the next date digit.',
      'Use every digit, in order, with math operators between them.',
      'Add exactly one equals sign so the left and right sides can match.',
    ],
  },
  {
    title: 'Shape each side',
    items: [
      'Try +, -, x, division, powers, roots, factorials, parentheses, and absolute value bars.',
      'PEMDAS matters. Parentheses help control the order of operations.',
      'Tap an equation element, or the space between elements, to add or remove operators.',
    ],
  },
  {
    title: 'Move and adjust',
    items: [
      'Use the arrow buttons to move to the previous or next selected element.',
      'Clear starts the whole equation over. Backspace removes the selected piece.',
      'Submit checks the equation and saves correct solutions in this browser.',
    ],
  },
  {
    title: 'Keep exploring',
    items: [
      'Calendar keeps your equations, solve times, and daily averages in this browser.',
      'Hard mode hides the helper values under the equation for a bigger challenge.',
      'Have fun and try different operators. There is usually more than one good answer.',
    ],
  },
];
