import { readInputs } from '../../src/sf-find-tests/inputReader';

describe('readInputs', () => {
  beforeEach(() => {
    process.env['INPUT_PACKAGE-XML'] = 'delta/package/package.xml';
    process.env['INPUT_SOURCE-DIR'] = 'force-app';
    process.env['INPUT_TEST-SUFFIXES'] = 'Test,_Test';
    process.env['INPUT_GITHUB-TOKEN'] = 'tok';
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('INPUT_')) delete process.env[key];
    }
  });

  it('reads raw inputs without validating', () => {
    expect(readInputs()).toEqual({
      packageXml: 'delta/package/package.xml',
      sourceDir: 'force-app',
      testSuffixes: 'Test,_Test',
      githubToken: 'tok',
    });
  });
});
