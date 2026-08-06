import { Orchestrator } from '../../../actions/github-release-pr-create/orchestrator';
import { Validator } from '../../../actions/github-release-pr-create/validator';
import { GithubContextService } from '../../../services/github-context-service';
import { ReleasePrService } from '../../../services/release-pr-service';
import type { CreateReleasePrResult, ValidatedCreateReleasePrInputs } from '../../../types';
import { ValidationError } from '../../../utils/errors';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const VALIDATED_INPUTS: ValidatedCreateReleasePrInputs = {
  sourceBranch: 'develop',
  targetBranch: 'main',
  releaseVersion: 'v1.2.0',
  title: undefined,
  bodyTemplate: undefined,
  draft: false,
  labels: [],
  reviewers: [],
  dryRun: false,
  githubToken: 'test-token',
};

const SERVICE_RESULT: CreateReleasePrResult = {
  created: true,
  updated: false,
  dryRun: false,
  pullRequestNumber: 7,
  pullRequestUrl: 'https://github.com/gforce/demo/pull/7',
  title: 'Release v1.2.0',
  body: 'body',
};

afterEach(() => {
  Orchestrator.resetInstance();
  Validator.resetInstance();
  GithubContextService.resetInstance();
  ReleasePrService.resetInstance();
  jest.restoreAllMocks();
});

describe('Orchestrator (github-release-pr-create)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Orchestrator.getInstance();

    // When
    const second = Orchestrator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('execute_validInputs_delegatesValidateResolveRepoAndCreateOrUpdate', async () => {
    // Given
    const rawInputs = { 'source-branch': 'develop' };
    const validateSpy = jest
      .spyOn(Validator.getInstance(), 'inputValidation')
      .mockReturnValue(VALIDATED_INPUTS);
    const repoSpy = jest.spyOn(GithubContextService.getInstance(), 'getRepo').mockReturnValue(REPO);
    const serviceSpy = jest
      .spyOn(ReleasePrService.getInstance(), 'createOrUpdate')
      .mockResolvedValue(SERVICE_RESULT);

    // When
    const result = await Orchestrator.getInstance().execute(rawInputs);

    // Then
    expect(validateSpy).toHaveBeenCalledWith(rawInputs);
    expect(repoSpy).toHaveBeenCalledWith();
    expect(serviceSpy).toHaveBeenCalledWith({ repo: REPO, ...VALIDATED_INPUTS });
    expect(result).toBe(SERVICE_RESULT);
  });

  test('execute_validatorThrows_propagatesWithoutCallingService', async () => {
    // Given
    jest.spyOn(Validator.getInstance(), 'inputValidation').mockImplementation(() => {
      throw new ValidationError('Input "release-version" is required');
    });
    const serviceSpy = jest.spyOn(ReleasePrService.getInstance(), 'createOrUpdate');

    // When
    const act = Orchestrator.getInstance().execute({});

    // Then
    await expect(act).rejects.toBeInstanceOf(ValidationError);
    await expect(act).rejects.toThrow('Input "release-version" is required');
    expect(serviceSpy).not.toHaveBeenCalled();
  });
});
