import { describe, expect, test } from 'vitest';
import {
  canonicalPuzzlePath,
  dateFromRouteLocation,
  isDateIdentifier,
  routeForPuzzleDate,
} from './dateRouting';

describe('date routing', () => {
  test('reads a puzzle date from a date path', () => {
    const date = dateFromRouteLocation(new URL('https://crackledate.com/date/2026-05-30'));

    expect(date).toBe('2026-05-30');
  });

  test('reads a puzzle date from the date query parameter', () => {
    const date = dateFromRouteLocation(new URL('https://crackledate.com/?date=2026-05-16'));

    expect(date).toBe('2026-05-16');
  });

  test('ignores malformed date route values', () => {
    expect(dateFromRouteLocation(new URL('https://crackledate.com/date/2026-13-40'))).toBeNull();
    expect(dateFromRouteLocation(new URL('https://crackledate.com/?date=not-a-date'))).toBeNull();
  });

  test('validates calendar date identifiers exactly', () => {
    expect(isDateIdentifier('2026-02-28')).toBe(true);
    expect(isDateIdentifier('2026-2-28')).toBe(false);
    expect(isDateIdentifier('2026-02-30')).toBe(false);
  });

  test('uses the home route for today and a date route for archive dates', () => {
    expect(routeForPuzzleDate('2026-06-09', '2026-06-09')).toBe('/');
    expect(routeForPuzzleDate('2026-06-01', '2026-06-09')).toBe('/date/2026-06-01');
  });

  test('canonicalizes query dated links to a date path', () => {
    const location = new URL('https://crackledate.com/?date=2026-06-01');

    expect(canonicalPuzzlePath(location, '2026-06-09')).toBe('/date/2026-06-01');
  });
});
