import { escapeRegExp } from '../../utils/escape-reg-exp';

describe('escapeRegExp', () => {
  test('escapeRegExp_specialCharacters_escapesForLiteralMatch', () => {
    // Given
    const value = 'a.b*c(d)';

    // When
    const escaped = escapeRegExp(value);

    // Then
    expect(escaped).toBe('a\\.b\\*c\\(d\\)');
    expect(new RegExp(escaped).test('a.b*c(d)')).toBe(true);
  });

  test('escapeRegExp_plainWord_returnsUnchanged', () => {
    // Given
    const value = 'InvoiceService';

    // When
    const escaped = escapeRegExp(value);

    // Then
    expect(escaped).toBe('InvoiceService');
  });
});
