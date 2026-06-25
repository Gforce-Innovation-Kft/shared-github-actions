import { ValidationError } from '../src/utils/errors/errors';
import {
  parseBoolean,
  parseEnum,
  parseList,
  requireNonEmpty,
} from '../src/utils/validation/validation';

describe('requireNonEmpty', () => {
  it('trims and returns non-empty values', () => {
    expect(requireNonEmpty('name', '  hello  ')).toBe('hello');
  });

  it.each([undefined, '', '   '])('throws for %p', (value) => {
    expect(() => requireNonEmpty('name', value)).toThrow(ValidationError);
  });
});

describe('parseBoolean', () => {
  it.each(['true', 'TRUE', '1', 'yes', 'y', 'on'])('parses %p as true', (value) => {
    expect(parseBoolean(value)).toBe(true);
  });

  it.each(['false', 'No', '0', 'off'])('parses %p as false', (value) => {
    expect(parseBoolean(value)).toBe(false);
  });

  it('falls back to the default when blank', () => {
    expect(parseBoolean('', true)).toBe(true);
    expect(parseBoolean(undefined)).toBe(false);
  });

  it('throws for invalid booleans', () => {
    expect(() => parseBoolean('maybe')).toThrow(ValidationError);
  });
});

describe('parseList', () => {
  it('splits on commas and newlines and drops blanks', () => {
    expect(parseList('a, b\nc,,\n  d ')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseList(undefined)).toEqual([]);
  });
});

describe('parseEnum', () => {
  const allowed = ['auto', 'merge'] as const;

  it('returns an allowed value', () => {
    expect(parseEnum('strategy', 'merge', allowed, 'auto')).toBe('merge');
  });

  it('returns the default when blank', () => {
    expect(parseEnum('strategy', '', allowed, 'auto')).toBe('auto');
  });

  it('throws for disallowed values', () => {
    expect(() => parseEnum('strategy', 'rebase', allowed, 'auto')).toThrow(ValidationError);
  });
});
