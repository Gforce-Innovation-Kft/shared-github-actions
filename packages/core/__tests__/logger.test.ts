import { NoopLogger } from '../src/utils/logging/logger';

describe('NoopLogger', () => {
  it('exposes no-op methods that do not throw', () => {
    expect(() => {
      NoopLogger.debug('d');
      NoopLogger.info('i');
      NoopLogger.warning('w');
      NoopLogger.error('e');
    }).not.toThrow();
  });
});
