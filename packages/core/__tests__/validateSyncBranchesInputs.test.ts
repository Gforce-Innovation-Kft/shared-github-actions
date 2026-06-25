import { validateSyncBranchesInputs } from '../src/actions/syncBranches/validateSyncBranchesInputs';
import type { RawSyncInputs } from '../src/actions/syncBranches/types';
import { ValidationError } from '../src/utils/errors/errors';

function raw(overrides: Partial<RawSyncInputs> = {}): RawSyncInputs {
  return {
    sourceBranch: 'develop',
    targetBranch: 'main',
    strategy: '',
    dryRun: '',
    githubToken: 'tok',
    ...overrides,
  };
}

describe('validateSyncBranchesInputs', () => {
  it('normalizes valid inputs and applies defaults', () => {
    expect(validateSyncBranchesInputs(raw())).toEqual({
      sourceBranch: 'develop',
      targetBranch: 'main',
      strategy: 'auto',
      dryRun: true,
      githubToken: 'tok',
    });
  });

  it('parses an explicit strategy and dry-run', () => {
    const result = validateSyncBranchesInputs(raw({ strategy: 'merge', dryRun: 'false' }));
    expect(result.strategy).toBe('merge');
    expect(result.dryRun).toBe(false);
  });

  it.each([
    ['source-branch', { sourceBranch: '' }],
    ['target-branch', { targetBranch: '' }],
    ['github-token', { githubToken: '' }],
  ])('requires %s', (_field, overrides) => {
    expect(() => validateSyncBranchesInputs(raw(overrides))).toThrow(ValidationError);
  });

  it('rejects identical source and target branches', () => {
    expect(() =>
      validateSyncBranchesInputs(raw({ sourceBranch: 'main', targetBranch: 'main' })),
    ).toThrow(/must be different/);
  });

  it('rejects an unknown strategy', () => {
    expect(() => validateSyncBranchesInputs(raw({ strategy: 'rebase' }))).toThrow(ValidationError);
  });
});
