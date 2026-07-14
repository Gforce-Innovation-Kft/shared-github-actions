import { parseApexMembers } from '../../../../libraries/salesforce/utils/parse-apex-members';

function manifest(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n<version>65.0</version>\n</Package>`;
}

describe('parseApexMembers', () => {
  test('parseApexMembers_apexClassAndTriggerBlocks_collectsMemberNames', () => {
    // Given
    const manifestXml = manifest(
      '<types><members>InvoicesSelector</members><members>FxRateService</members><name>ApexClass</name></types>' +
        '<types><members>InvoiceTrigger</members><name>ApexTrigger</name></types>',
    );

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({
      names: ['InvoicesSelector', 'FxRateService', 'InvoiceTrigger'],
      hasWildcard: false,
    });
  });

  test('parseApexMembers_nonApexTypes_ignoresMembers', () => {
    // Given
    const manifestXml = manifest(
      '<types><members>Account.Custom__c</members><name>CustomField</name></types>',
    );

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({ names: [], hasWildcard: false });
  });

  test('parseApexMembers_wildcardMember_setsHasWildcard', () => {
    // Given
    const manifestXml = manifest('<types><members>*</members><name>ApexClass</name></types>');

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({ names: [], hasWildcard: true });
  });

  test('parseApexMembers_typesBlockWithoutNameTag_ignoresMembers', () => {
    // Given
    const manifestXml = manifest('<types><members>Orphan</members></types>');

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({ names: [], hasWildcard: false });
  });

  test('parseApexMembers_apexBlockWithoutMembers_returnsEmptySelection', () => {
    // Given
    const manifestXml = manifest('<types><name>ApexClass</name></types>');

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({ names: [], hasWildcard: false });
  });

  test('parseApexMembers_emptyManifest_returnsEmptySelection', () => {
    // Given
    const manifestXml = manifest('');

    // When
    const result = parseApexMembers(manifestXml);

    // Then
    expect(result).toEqual({ names: [], hasWildcard: false });
  });
});
