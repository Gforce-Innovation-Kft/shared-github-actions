import { parseRepoRef } from '../src/github-service/parseRepoRef';
import { ValidationError } from '../src/utils/errors/errors';

describe('parseRepoRef', () => {
  it('parses a well-formed owner/repo slug', () => {
    expect(parseRepoRef('gforceinnovation/demo')).toEqual({
      owner: 'gforceinnovation',
      repo: 'demo',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseRepoRef('  gforceinnovation/demo  ')).toEqual({
      owner: 'gforceinnovation',
      repo: 'demo',
    });
  });

  it.each(['', 'demo', 'a/b/c', '/demo', 'owner/'])('rejects malformed input %p', (value) => {
    expect(() => parseRepoRef(value)).toThrow(ValidationError);
  });
});
