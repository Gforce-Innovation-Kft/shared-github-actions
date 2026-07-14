import { GithubContextService } from '../../services/github-context-service';
import { ValidationError } from '../../utils/errors';

const ORIGINAL_ENV = process.env.GITHUB_REPOSITORY;

afterEach(() => {
  GithubContextService.resetInstance();
  if (ORIGINAL_ENV === undefined) {
    delete process.env.GITHUB_REPOSITORY;
  } else {
    process.env.GITHUB_REPOSITORY = ORIGINAL_ENV;
  }
});

describe('GithubContextService', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = GithubContextService.getInstance();

    // When
    const second = GithubContextService.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('getRepo_wellFormedEnvironment_returnsRepoRef', () => {
    // Given
    process.env.GITHUB_REPOSITORY = 'Gforce-Innovation-Kft/shared-github-actions';

    // When
    const repo = GithubContextService.getInstance().getRepo();

    // Then
    expect(repo).toEqual({ owner: 'Gforce-Innovation-Kft', repo: 'shared-github-actions' });
  });

  test('getRepo_missingEnvironment_throwsValidationError', () => {
    // Given
    delete process.env.GITHUB_REPOSITORY;

    // When
    const act = (): unknown => GithubContextService.getInstance().getRepo();

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected a repository in "owner/repo" format but received ""');
  });
});
