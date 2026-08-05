import { AppError, GitHubApiError, ValidationError } from '../../utils/errors';

describe('AppError', () => {
  test('constructor_noCode_defaultsToAppErrorCode', () => {
    // Given
    const message = 'something went wrong';

    // When
    const error = new AppError(message);

    // Then
    expect(error.message).toBe('something went wrong');
    expect(error.code).toBe('APP_ERROR');
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
  });

  test('constructor_customCode_keepsCode', () => {
    // Given
    const message = 'custom failure';

    // When
    const error = new AppError(message, 'CUSTOM_CODE');

    // Then
    expect(error.code).toBe('CUSTOM_CODE');
  });
});

describe('ValidationError', () => {
  test('constructor_message_setsValidationCodeAndName', () => {
    // Given
    const message = 'bad input';

    // When
    const error = new ValidationError(message);

    // Then
    expect(error.message).toBe('bad input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('GitHubApiError', () => {
  test('constructor_withStatus_keepsStatusAndCode', () => {
    // Given
    const message = 'api exploded';

    // When
    const error = new GitHubApiError(message, 502);

    // Then
    expect(error.message).toBe('api exploded');
    expect(error.status).toBe(502);
    expect(error.code).toBe('GITHUB_API_ERROR');
    expect(error).toBeInstanceOf(AppError);
  });

  test('constructor_withoutStatus_leavesStatusUndefined', () => {
    // Given
    const message = 'api exploded';

    // When
    const error = new GitHubApiError(message);

    // Then
    expect(error.status).toBeUndefined();
  });
});
