import { ValidationError } from '../../utils/errors';
import { parseBoolean, parseEnum, parseList, requireNonEmpty } from '../../utils/validation';

describe('requireNonEmpty', () => {
  test('requireNonEmpty_paddedValue_returnsTrimmed', () => {
    // Given
    const value = '  main  ';

    // When
    const result = requireNonEmpty('branch', value);

    // Then
    expect(result).toBe('main');
  });

  test('requireNonEmpty_blankValue_throwsValidationError', () => {
    // Given
    const value = '   ';

    // When
    const act = (): string => requireNonEmpty('branch', value);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "branch" is required');
  });

  test('requireNonEmpty_undefined_throwsValidationError', () => {
    // Given
    const value = undefined;

    // When
    const act = (): string => requireNonEmpty('branch', value);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "branch" is required');
  });
});

describe('parseBoolean', () => {
  test('parseBoolean_blankValue_returnsDefault', () => {
    // Given
    const value = '';

    // When
    const result = parseBoolean(value, true);

    // Then
    expect(result).toBe(true);
  });

  test('parseBoolean_undefinedWithoutDefault_returnsFalse', () => {
    // Given
    const value = undefined;

    // When
    const result = parseBoolean(value);

    // Then
    expect(result).toBe(false);
  });

  test('parseBoolean_truthyToken_returnsTrue', () => {
    // Given
    const value = ' Yes ';

    // When
    const result = parseBoolean(value);

    // Then
    expect(result).toBe(true);
  });

  test('parseBoolean_falsyToken_returnsFalse', () => {
    // Given
    const value = 'OFF';

    // When
    const result = parseBoolean(value, true);

    // Then
    expect(result).toBe(false);
  });

  test('parseBoolean_unknownToken_throwsValidationError', () => {
    // Given
    const value = 'maybe';

    // When
    const act = (): boolean => parseBoolean(value);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected a boolean but received "maybe"');
  });
});

describe('parseList', () => {
  test('parseList_commaAndNewlineSeparated_returnsTrimmedEntries', () => {
    // Given
    const value = ' one, two \n three ,, \n ';

    // When
    const result = parseList(value);

    // Then
    expect(result).toEqual(['one', 'two', 'three']);
  });

  test('parseList_undefined_returnsEmptyList', () => {
    // Given
    const value = undefined;

    // When
    const result = parseList(value);

    // Then
    expect(result).toEqual([]);
  });
});

describe('parseEnum', () => {
  const ALLOWED = ['merge', 'rebase'] as const;

  test('parseEnum_blankValue_returnsDefault', () => {
    // Given
    const value = '  ';

    // When
    const result = parseEnum('strategy', value, ALLOWED, 'merge');

    // Then
    expect(result).toBe('merge');
  });

  test('parseEnum_undefined_returnsDefault', () => {
    // Given
    const value = undefined;

    // When
    const result = parseEnum('strategy', value, ALLOWED, 'merge');

    // Then
    expect(result).toBe('merge');
  });

  test('parseEnum_allowedValue_returnsValue', () => {
    // Given
    const value = 'rebase';

    // When
    const result = parseEnum('strategy', value, ALLOWED, 'merge');

    // Then
    expect(result).toBe('rebase');
  });

  test('parseEnum_disallowedValue_throwsValidationError', () => {
    // Given
    const value = 'squash';

    // When
    const act = (): string => parseEnum('strategy', value, ALLOWED, 'merge');

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "strategy" must be one of: merge, rebase (received "squash")');
  });
});
