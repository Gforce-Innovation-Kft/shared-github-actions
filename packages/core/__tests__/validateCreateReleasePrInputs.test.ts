import { validateCreateReleasePrInputs } from '../src/actions/createReleasePr/validateCreateReleasePrInputs';
import type { RawReleasePrInputs } from '../src/actions/createReleasePr/types';
import { ValidationError } from '../src/utils/errors/errors';

function raw(overrides: Partial<RawReleasePrInputs> = {}): RawReleasePrInputs {
  return {
    sourceBranch: 'develop',
    targetBranch: 'main',
    releaseVersion: 'v1.2.0',
    title: '',
    bodyTemplate: '',
    draft: '',
    labels: '',
    reviewers: '',
    dryRun: '',
    githubToken: 'tok',
    ...overrides,
  };
}

describe('validateCreateReleasePrInputs', () => {
  it('normalizes a full input set', () => {
    const result = validateCreateReleasePrInputs(
      raw({
        title: '  Release  ',
        bodyTemplate: '  ## body  ',
        draft: 'true',
        labels: 'release, automated\nhotfix',
        reviewers: 'octocat, hubot',
        dryRun: 'false',
      }),
    );

    expect(result).toEqual({
      sourceBranch: 'develop',
      targetBranch: 'main',
      releaseVersion: 'v1.2.0',
      githubToken: 'tok',
      title: 'Release',
      bodyTemplate: '## body',
      draft: true,
      labels: ['release', 'automated', 'hotfix'],
      reviewers: ['octocat', 'hubot'],
      dryRun: false,
    });
  });

  it('defaults optional fields (dry-run true, draft false, no title/body, empty lists)', () => {
    expect(validateCreateReleasePrInputs(raw())).toMatchObject({
      title: undefined,
      bodyTemplate: undefined,
      draft: false,
      labels: [],
      reviewers: [],
      dryRun: true,
    });
  });

  it('rejects a missing release version', () => {
    expect(() => validateCreateReleasePrInputs(raw({ releaseVersion: '' }))).toThrow(
      ValidationError,
    );
  });

  it('rejects identical source and target branches', () => {
    expect(() => validateCreateReleasePrInputs(raw({ targetBranch: 'develop' }))).toThrow(
      /must be different/,
    );
  });
});
