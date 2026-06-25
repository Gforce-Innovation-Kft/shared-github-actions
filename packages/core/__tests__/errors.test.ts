import { AppError, GitHubApiError, ValidationError, asAppError } from '../src/utils/errors/errors';

describe('errors', () => {
  it('sets name and code on AppError', () => {
    const error = new AppError('boom');
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('APP_ERROR');
    expect(error).toBeInstanceOf(Error);
  });

  it('specializes ValidationError', () => {
    const error = new ValidationError('bad');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error).toBeInstanceOf(AppError);
  });

  it('carries an HTTP status on GitHubApiError', () => {
    const error = new GitHubApiError('api', 422);
    expect(error.code).toBe('GITHUB_API_ERROR');
    expect(error.status).toBe(422);
  });

  describe('asAppError', () => {
    it('returns AppError instances unchanged', () => {
      const original = new ValidationError('x');
      expect(asAppError(original)).toBe(original);
    });

    it('wraps native errors', () => {
      const wrapped = asAppError(new Error('native'));
      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe('native');
    });

    it('stringifies non-error values', () => {
      const wrapped = asAppError('plain');
      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe('plain');
    });
  });
});
