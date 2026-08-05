import {
  createOctokit,
  getErrorStatus,
  getSharedOctokit,
  resetSharedOctokit,
  runOctokit,
  toGitHubApiError,
} from '../../../../clients/github/core/github-client-core';
import { GitHubApiError, ValidationError } from '../../../../utils/errors';

afterEach(() => {
  resetSharedOctokit();
});

describe('createOctokit', () => {
  test('createOctokit_calledTwice_returnsDistinctInstances', () => {
    // Given
    const token = 'test-token';

    // When
    const first = createOctokit(token);

    // Then
    expect(first).not.toBe(createOctokit(token));
  });
});

describe('getSharedOctokit', () => {
  test('getSharedOctokit_sameToken_returnsCachedInstance', () => {
    // Given
    const first = getSharedOctokit('test-token');

    // When
    const second = getSharedOctokit('test-token');

    // Then
    expect(second).toBe(first);
  });

  test('getSharedOctokit_differentToken_throwsValidationError', () => {
    // Given
    getSharedOctokit('first-token');

    // When
    const act = (): unknown => getSharedOctokit('second-token');

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('A shared Octokit already exists for a different token.');
  });

  test('getSharedOctokit_afterReset_buildsFreshInstance', () => {
    // Given
    const first = getSharedOctokit('first-token');
    resetSharedOctokit();

    // When
    const second = getSharedOctokit('second-token');

    // Then
    expect(second).not.toBe(first);
  });
});

describe('getErrorStatus', () => {
  test('getErrorStatus_objectWithNumericStatus_returnsStatus', () => {
    // Given
    const error = { status: 409 };

    // When
    const status = getErrorStatus(error);

    // Then
    expect(status).toBe(409);
  });

  test('getErrorStatus_objectWithNonNumericStatus_returnsUndefined', () => {
    // Given
    const error = { status: 'conflict' };

    // When
    const status = getErrorStatus(error);

    // Then
    expect(status).toBeUndefined();
  });

  test('getErrorStatus_objectWithoutStatus_returnsUndefined', () => {
    // Given
    const error = { message: 'no status here' };

    // When
    const status = getErrorStatus(error);

    // Then
    expect(status).toBeUndefined();
  });

  test('getErrorStatus_null_returnsUndefined', () => {
    // Given
    const error = null;

    // When
    const status = getErrorStatus(error);

    // Then
    expect(status).toBeUndefined();
  });

  test('getErrorStatus_primitive_returnsUndefined', () => {
    // Given
    const error = 'boom';

    // When
    const status = getErrorStatus(error);

    // Then
    expect(status).toBeUndefined();
  });
});

describe('toGitHubApiError', () => {
  test('toGitHubApiError_errorWithStatus_wrapsMessageAndStatus', () => {
    // Given
    const error = Object.assign(new Error('boom'), { status: 502 });

    // When
    const wrapped = toGitHubApiError(error, 'compare branches');

    // Then
    expect(wrapped).toBeInstanceOf(GitHubApiError);
    expect(wrapped.message).toBe('Failed to compare branches: boom');
    expect(wrapped.status).toBe(502);
  });

  test('toGitHubApiError_nonErrorValue_stringifies', () => {
    // Given
    const error = 'wire fell out';

    // When
    const wrapped = toGitHubApiError(error, 'list pull requests');

    // Then
    expect(wrapped.message).toBe('Failed to list pull requests: wire fell out');
    expect(wrapped.status).toBeUndefined();
  });
});

describe('runOctokit', () => {
  test('runOctokit_successfulCall_returnsValue', async () => {
    // Given
    const fn = jest.fn().mockResolvedValue(42);

    // When
    const result = await runOctokit('answer the question', fn);

    // Then
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledWith();
  });

  test('runOctokit_failingCall_throwsGitHubApiError', async () => {
    // Given
    const fn = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));

    // When
    const act = runOctokit('update branch ref', fn);

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to update branch ref: boom');
  });
});
