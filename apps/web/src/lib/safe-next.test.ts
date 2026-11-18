import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/', '/'],
    ['/boards/1', '/boards/1'],
    ['/boards/1?tab=a#x', '/boards/1?tab=a#x'],
  ])('accepts same-origin path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '',
    42,
    'boards',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/ok\nLocation: x',
    '/\tfoo',
  ])('falls back to / for %j', (input) => {
    expect(safeNext(input)).toBe('/');
  });
});
