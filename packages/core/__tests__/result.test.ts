import { ok, err, isOk, isErr } from '../src/utils/result/result';
import { AppError } from '../src/utils/errors/errors';

describe('result', () => {
  it('wraps success values', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('wraps error values', () => {
    const result = err(new AppError('nope'));
    expect(result.ok).toBe(false);
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error.message).toBe('nope');
    }
  });
});
