import { validateFindTestsInputs } from '../src/actions/findRelevantTests/validateFindTestsInputs';
import { ValidationError } from '../src/utils/errors/errors';

const RAW = {
  packageXml: 'delta/package/package.xml',
  sourceDir: 'force-app',
  testSuffixes: '',
  githubToken: 'tok',
};

describe('validateFindTestsInputs', () => {
  it('applies the default suffixes when blank', () => {
    expect(validateFindTestsInputs(RAW).testSuffixes).toEqual(['Test', '_Test', 'Tests']);
  });

  it('parses a comma-separated suffix list', () => {
    expect(validateFindTestsInputs({ ...RAW, testSuffixes: 'Spec, UT' }).testSuffixes).toEqual([
      'Spec',
      'UT',
    ]);
  });

  it('requires package-xml', () => {
    expect(() => validateFindTestsInputs({ ...RAW, packageXml: ' ' })).toThrow(ValidationError);
  });

  it('requires github-token (runtime contract)', () => {
    expect(() => validateFindTestsInputs({ ...RAW, githubToken: '' })).toThrow(ValidationError);
  });
});
