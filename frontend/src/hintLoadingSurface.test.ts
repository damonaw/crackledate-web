import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('hint loading surface', () => {
  test('renders a durable inline loading panel while hints are loading', () => {
    expect(source).toContain('hintLoading &&');
    expect(source).toContain('className="hint-panel hint-loading"');
    expect(source).toContain('Finding a hint...');
  });
});
