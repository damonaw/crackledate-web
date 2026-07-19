import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const frontendUrl = new URL('../', import.meta.url);
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const howToPlaySource = readFileSync(new URL('./howToPlayContent.ts', import.meta.url), 'utf8');
const productSurface = [mainSource, stylesSource, howToPlaySource].join('\n');

function readLegacySource(relativePath: string): string {
  const sourceUrl = new URL(relativePath, frontendUrl);
  return existsSync(sourceUrl) ? readFileSync(sourceUrl, 'utf8') : '';
}

describe('browser-local product contract', () => {
  test('has no browser submission client, transport, or call', () => {
    expect(existsSync(new URL('./src/submissions.ts', frontendUrl))).toBe(false);
    expect(existsSync(new URL('./src/submissions.test.ts', frontendUrl))).toBe(false);
    expect(mainSource).not.toContain("from './submissions'");
    expect(mainSource).not.toContain('submitSolutionRecord');
    expect(mainSource).not.toContain('/api/submissions');
  });

  test('has no achievement calculators', () => {
    for (const relativePath of [
      './src/solutionBadges.ts',
      './src/solutionBadges.test.ts',
      './src/nextBadgeTargets.ts',
      './src/nextBadgeTargets.test.ts',
    ]) {
      expect(existsSync(new URL(relativePath, frontendUrl))).toBe(false);
    }
  });

  test('has no achievement UI or empty achievement layout', () => {
    for (const removedIdentifier of [
      'solutionBadges',
      'nextBadgeTarget',
      'Earned Badges',
      'Next Badge',
    ]) {
      expect(mainSource).not.toContain(removedIdentifier);
    }
  });

  test('has no achievement-only styles and uses generic metadata identifiers', () => {
    for (const removedSelector of [
      '.next-badge-target',
      '.badges-section',
      '.badge-grid',
      '.badge-card',
      '.solution-badge',
      '.victory-badge-row',
      '.victory-badge-pill',
      '.victory-badge-mode',
      '.victory-badge-diff',
      '.victory-badge-hint',
    ]) {
      expect(stylesSource).not.toContain(removedSelector);
    }

    for (const replacementIdentifier of [
      '.solution-tag',
      '.archive-tag',
      '.hint-tag',
      '.victory-status-row',
      '.victory-status-pill',
      '.victory-meta-mode',
      '.victory-meta-difficulty',
      '.victory-meta-hint',
    ]) {
      expect(stylesSource).toContain(replacementIdentifier);
    }
  });

  test('renders preserved solution metadata with generic JSX identifiers', () => {
    for (const preservedMetadata of [
      'className="solution-tag archive-tag">Archive',
      'className="solution-tag hint-tag">Used Hint',
      'className={`solution-tag difficulty-${solution.difficulty}`}',
      '{solution.difficulty}',
      'className="victory-status-row"',
      'className="victory-status-pill"',
      'className="victory-meta-mode">Classic',
      "className={`victory-meta-difficulty difficulty-${sol.difficulty || 'easy'}`}",
      "{sol.difficulty || 'easy'}",
      'className="victory-meta-hint">💡 Hint',
    ]) {
      expect(mainSource).toContain(preservedMetadata);
    }

    for (const oldJsxClass of [
      'solution-badge',
      'archive-badge',
      'hint-badge',
      'victory-badge-row',
      'victory-badge-pill',
      'victory-badge-mode',
      'victory-badge-diff',
      'victory-badge-hint',
    ]) {
      expect(mainSource).not.toContain(oldJsxClass);
    }
  });

  test('has no achievement asset paths, titles, or instructional copy', () => {
    const achievementCopy = [productSurface, readLegacySource('./src/solutionBadges.ts')].join('\n');
    for (const removedCopy of [
      '/badges/',
      'First Solution',
      'Three Day Streak',
      'Zero = Zero',
      'Multiplied by Zero',
      'Double Decker',
      'Badges appear',
      'earned any badges',
    ]) {
      expect(achievementCopy).not.toContain(removedCopy);
    }
  });

  test('has no achievement badge asset directory', () => {
    expect(existsSync(new URL('./public/badges', frontendUrl))).toBe(false);
  });

  test('uses Calendar as the only saved-history destination', () => {
    for (const removedSurface of [
      "| 'solutions'",
      'label="Stats"',
      'function SolutionsPage(',
      'function SummaryStat(',
      'function StatsIcon(',
      'solutions-summary-section',
      'solutions-activity-section',
    ]) {
      expect(productSurface).not.toContain(removedSurface);
    }

    expect(mainSource).toContain('Average Time');
    expect(mainSource).toContain("averageSeconds === null ? '—' : formatTime(averageSeconds)");
  });
});
