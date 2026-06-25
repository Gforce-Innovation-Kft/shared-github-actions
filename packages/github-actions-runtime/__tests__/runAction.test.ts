import * as core from '@actions/core';
import { OctokitGitHubService, ok, err, AppError, type ActionContext } from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '../src/runAction';

jest.mock('@actions/core');

interface Raw {
  readonly githubToken: string;
}
type Validated = Raw;

const CONTEXT: ActionContext = {
  github: {} as ActionContext['github'],
  logger: { debug() {}, info() {}, warning() {}, error() {} },
  repo: { owner: 'gforceinnovation', repo: 'demo' },
};

function definition(
  overrides: Partial<GitHubActionDefinition<Raw, Validated, string>> = {},
): GitHubActionDefinition<Raw, Validated, string> {
  return {
    readInputs: jest.fn(() => ({ githubToken: 'tok' })),
    validateInputs: jest.fn((raw: Raw) => raw),
    execute: jest.fn(async () => ok('done')),
    writeOutputs: jest.fn(),
    ...overrides,
  };
}

describe('runGitHubAction', () => {
  afterEach(() => {
    OctokitGitHubService.resetInstance();
    jest.clearAllMocks();
  });

  it('writes outputs on success and never fails', async () => {
    const def = definition();
    await runGitHubAction(def, CONTEXT);

    expect(def.execute).toHaveBeenCalledWith({ githubToken: 'tok' }, CONTEXT);
    expect(def.writeOutputs).toHaveBeenCalledWith('done');
    expect(jest.mocked(core.setFailed)).not.toHaveBeenCalled();
  });

  it('fails the action when the use case returns an error', async () => {
    const def = definition({ execute: jest.fn(async () => err(new AppError('boom'))) });
    await runGitHubAction(def, CONTEXT);

    expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith('boom');
    expect(def.writeOutputs).not.toHaveBeenCalled();
  });

  it('fails the action when a step throws an Error', async () => {
    const def = definition({
      validateInputs: jest.fn(() => {
        throw new Error('bad input');
      }),
    });
    await runGitHubAction(def, CONTEXT);

    expect(def.execute).not.toHaveBeenCalled();
    expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith('bad input');
  });

  it('stringifies a non-Error throw', async () => {
    const def = definition({
      readInputs: jest.fn(() => {
        throw 'string failure';
      }),
    });
    await runGitHubAction(def);

    expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith('string failure');
  });

  it('builds the default context (env repo + shared service) when no overrides', async () => {
    const original = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'gforceinnovation/demo';

    const execute = jest.fn(async (_input: Validated, context: ActionContext) => {
      expect(context.repo).toEqual({ owner: 'gforceinnovation', repo: 'demo' });
      expect(context.github).toBe(OctokitGitHubService.getInstance('tok'));
      return ok('done');
    });
    await runGitHubAction(definition({ execute }));

    expect(execute).toHaveBeenCalled();
    expect(jest.mocked(core.setFailed)).not.toHaveBeenCalled();
    process.env.GITHUB_REPOSITORY = original;
  });
});
