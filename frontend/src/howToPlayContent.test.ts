import { describe, expect, test } from 'vitest';
import { HOW_TO_PLAY_DETAIL_CARDS, HOW_TO_PLAY_SECTIONS } from './howToPlayContent';

describe('HOW_TO_PLAY_SECTIONS', () => {
  test('covers the core equation-building flow', () => {
    const copy = HOW_TO_PLAY_SECTIONS.flatMap((section) => [
      section.title,
      ...section.items,
    ]).join(' ');

    expect(copy).toContain('Tap the blue number');
    expect(copy).toContain('Use every digit');
    expect(copy).toContain('Add exactly one equals sign');
    expect(copy).toContain('Submit');
  });

  test('explains advanced controls and hard mode', () => {
    const copy = HOW_TO_PLAY_SECTIONS.flatMap((section) => [
      section.title,
      ...section.items,
    ]).join(' ');

    expect(copy).toContain('Tap an equation element');
    expect(copy).toContain('PEMDAS');
    expect(copy).toContain('Hard mode hides the helper values');
    expect(copy).toContain('Badges');
  });
});

describe('HOW_TO_PLAY_DETAIL_CARDS', () => {
  test('provides screenshot cards with notes for the detailed guide', () => {
    expect(HOW_TO_PLAY_DETAIL_CARDS).toHaveLength(10);

    for (const card of HOW_TO_PLAY_DETAIL_CARDS) {
      expect(card.imageSrc).toMatch(/^\/how-to-play\/instruction-\d+\.png$/);
      expect(card.imageAlt).toContain('Crackle Date');
      expect(card.note.length).toBeGreaterThan(30);
    }
  });

  test('covers building, editing, and settings details', () => {
    const copy = HOW_TO_PLAY_DETAIL_CARDS.map((card) => `${card.title} ${card.note}`).join(' ');

    expect(copy).toContain('Start with the blue digit');
    expect(copy).toContain('selected');
    expect(copy).toContain('Hard mode');
    expect(copy).toContain('PEMDAS');
    expect(copy).toContain('Clear');
    expect(copy).toContain('badges');
  });

  test('matches the requested detailed card copy by card number', () => {
    expect(HOW_TO_PLAY_DETAIL_CARDS[3]?.title).toBe('Use all the digits');
    expect(HOW_TO_PLAY_DETAIL_CARDS[3]?.note).toBe(
      'Make both sides equal each other before you submit.'
    );
    expect(HOW_TO_PLAY_DETAIL_CARDS[5]?.title).toBe('Check Stats');
    expect(HOW_TO_PLAY_DETAIL_CARDS[5]?.note).toBe(
      'Check Stats to see if you earned any badges and admire your solutions.'
    );
    expect(HOW_TO_PLAY_DETAIL_CARDS[6]?.title).toBe('Try Hard mode');
    expect(HOW_TO_PLAY_DETAIL_CARDS[6]?.note).toBe(
      'For a real challenge, try Hard mode. The helper left and right values under the equation are not present.'
    );
    expect(HOW_TO_PLAY_DETAIL_CARDS[8]?.title).toBe('Remember PEMDAS');
    expect(HOW_TO_PLAY_DETAIL_CARDS[8]?.note).toBe(
      'Do not forget about PEMDAS. Parentheses help with order of operations when the equation needs a different grouping.'
    );
    expect(HOW_TO_PLAY_DETAIL_CARDS[9]?.title).toBe('Submit or clear');
    expect(HOW_TO_PLAY_DETAIL_CARDS[9]?.note).toBe(
      'Submit checks and saves the equation. Want to start fresh? Clear the whole equation, or use backspace to remove one selected piece.'
    );
  });
});
