export type HowToPlaySection = {
  title: string;
  items: string[];
};

export type HowToPlayDetailCard = {
  title: string;
  imageSrc: string;
  imageAlt: string;
  note: string;
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
      'Badges appear with your saved solutions when you unlock something fancy.',
      'Hard mode hides the helper values under the equation for a bigger challenge.',
      'Have fun and try different operators. There is usually more than one good answer.',
    ],
  },
];

export const HOW_TO_PLAY_DETAIL_CARDS: HowToPlayDetailCard[] = [
  {
    title: 'Press the numbers',
    imageSrc: '/how-to-play/instruction-1.png',
    imageAlt: 'Crackle Date game board showing the first blue digit ready to press',
    note: 'Start with the blue digit. Press the numbers in order from the date rail to build your Crackle Date equation.',
  },
  {
    title: 'Use math operations',
    imageSrc: '/how-to-play/instruction-2.png',
    imageAlt: 'Crackle Date game board showing operator buttons below the date digits',
    note: 'Use math operations between the digits. Addition, subtraction, multiplication, and division are a good place to start.',
  },
  {
    title: 'Add the equals sign',
    imageSrc: '/how-to-play/instruction-3.png',
    imageAlt: 'Crackle Date equation showing an equals sign and remaining digits',
    note: 'Do not forget an equals sign. Use all the digits and make both sides equal each other before you submit.',
  },
  {
    title: 'Use all the digits',
    imageSrc: '/how-to-play/instruction-4.png',
    imageAlt: 'Crackle Date equation showing a completed expression with helper values',
    note: 'Make both sides equal each other before you submit.',
  },
  {
    title: 'Try different operators',
    imageSrc: '/how-to-play/instruction-5.png',
    imageAlt: 'Crackle Date saved solutions screen showing badges and saved equations',
    note: 'Have fun and try different operators. That is a fancy solution you have got there.',
  },
  {
    title: 'Check Stats',
    imageSrc: '/how-to-play/instruction-6.png',
    imageAlt: 'Crackle Date settings screen showing the Hard difficulty option selected',
    note: 'Check Stats to see if you earned any badges and admire your solutions.',
  },
  {
    title: 'Try Hard mode',
    imageSrc: '/how-to-play/instruction-7.png',
    imageAlt: 'Crackle Date game board showing a fraction and square root expression',
    note: 'For a real challenge, try Hard mode. The helper left and right values under the equation are not present.',
  },
  {
    title: 'Adjust the equation',
    imageSrc: '/how-to-play/instruction-8.png',
    imageAlt: 'Crackle Date game board showing a selected operator inside an equation',
    note: 'Need to adjust your equation? Tap an element, or the space between elements, to add or remove operators. The arrow buttons move to the next or previous selected element.',
  },
  {
    title: 'Remember PEMDAS',
    imageSrc: '/how-to-play/instruction-9.png',
    imageAlt: 'Crackle Date controls showing parentheses, clear, backspace, equals, and submit buttons',
    note: 'Do not forget about PEMDAS. Parentheses help with order of operations when the equation needs a different grouping.',
  },
  {
    title: 'Submit or clear',
    imageSrc: '/how-to-play/instruction-10.png',
    imageAlt: 'Crackle Date game board showing an empty equation prompt',
    note: 'Submit checks and saves the equation. Want to start fresh? Clear the whole equation, or use backspace to remove one selected piece.',
  },
];
