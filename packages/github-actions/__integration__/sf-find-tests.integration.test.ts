/**
 * Integration coverage: drive the whole action — read inputs, validate, run the
 * use case against the real filesystem, write outputs — through the shared
 * runtime runner (no network, no runner), and verify the committed bundle
 * exists.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@actions/core';
import { NoopLogger, type GitHubService } from '@gforce/core';
import { run } from '../src/sf-find-tests/index';

describe('sf-find-tests integration', () => {
  const fixtures = join(__dirname, 'fixtures');
  let outputs: Record<string, string>;

  beforeEach(() => {
    outputs = {};
    jest.spyOn(core, 'setOutput').mockImplementation((name, value) => {
      outputs[name] = String(value);
    });
    jest.spyOn(core, 'setFailed').mockImplementation(() => undefined);
    jest.spyOn(core, 'info').mockImplementation(() => undefined);
    process.env['INPUT_PACKAGE-XML'] = join(fixtures, 'package.xml');
    process.env['INPUT_SOURCE-DIR'] = join(fixtures, 'force-app');
    process.env['INPUT_TEST-SUFFIXES'] = '';
    process.env['INPUT_GITHUB-TOKEN'] = 'test-token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('INPUT_')) delete process.env[key];
    }
  });

  it('selects naming and reference matches end-to-end against real files', async () => {
    await run({
      github: {} as GitHubService,
      logger: NoopLogger,
      repo: { owner: 'gforce', repo: 'fixture' },
    });
    expect(outputs['has-apex']).toBe('true');
    expect(outputs['test-count']).toBe('2');
    expect(outputs['tests']).toBe('InvoiceServiceTest InvoicesSelectorTest');
  });

  it('ships a committed bundle', () => {
    expect(
      existsSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '.github',
          'actions',
          'sf-find-tests',
          'dist',
          'index.js',
        ),
      ),
    ).toBe(true);
  });
});
