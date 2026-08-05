import { ValidationError } from '../../utils/errors';
import { parseRepoRef } from '../../utils/parse-repo-ref';

describe('parseRepoRef', () => {
  test('parseRepoRef_wellFormedSlug_returnsOwnerAndRepo', () => {
    // Given
    const value = ' Gforce-Innovation-Kft/shared-github-actions ';

    // When
    const result = parseRepoRef(value);

    // Then
    expect(result).toEqual({ owner: 'Gforce-Innovation-Kft', repo: 'shared-github-actions' });
  });

  test('parseRepoRef_missingRepoSegment_throwsValidationError', () => {
    // Given
    const value = 'owner-only';

    // When
    const act = (): unknown => parseRepoRef(value);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected a repository in "owner/repo" format but received "owner-only"');
  });

  test('parseRepoRef_extraSegment_throwsValidationError', () => {
    // Given
    const value = 'a/b/c';

    // When
    const act = (): unknown => parseRepoRef(value);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected a repository in "owner/repo" format but received "a/b/c"');
  });
});
