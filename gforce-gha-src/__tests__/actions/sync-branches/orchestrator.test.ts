import { Orchestrator } from '../../../actions/sync-branches/orchestrator';
import { Validator } from '../../../actions/sync-branches/validator';
import { BranchSyncService } from '../../../services/branch-sync-service';
import { GithubContextService } from '../../../services/github-context-service';
import type { SyncBranchesResult, ValidatedSyncBranchesInputs } from '../../../types';
import { ValidationError } from '../../../utils/errors';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const VALIDATED_INPUTS: ValidatedSyncBranchesInputs = {
  sourceBranch: 'develop',
  targetBranch: 'main',
  strategy: 'auto',
  dryRun: false,
  githubToken: 'test-token',
};

const SYNC_RESULT: SyncBranchesResult = {
  action: 'fast-forward',
  synced: true,
  dryRun: false,
  aheadBy: 1,
  behindBy: 0,
  resultSha: 'head-sha',
  reason: 'fast-forward',
};

afterEach(() => {
  Orchestrator.resetInstance();
  Validator.resetInstance();
  GithubContextService.resetInstance();
  BranchSyncService.resetInstance();
  jest.restoreAllMocks();
});

describe('Orchestrator (sync-branches)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Orchestrator.getInstance();

    // When
    const second = Orchestrator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('execute_validInputs_delegatesValidateResolveRepoAndSync', async () => {
    // Given
    const rawInputs = { 'source-branch': 'develop' };
    const validateSpy = jest
      .spyOn(Validator.getInstance(), 'inputValidation')
      .mockReturnValue(VALIDATED_INPUTS);
    const repoSpy = jest.spyOn(GithubContextService.getInstance(), 'getRepo').mockReturnValue(REPO);
    const syncSpy = jest
      .spyOn(BranchSyncService.getInstance(), 'sync')
      .mockResolvedValue(SYNC_RESULT);

    // When
    const result = await Orchestrator.getInstance().execute(rawInputs);

    // Then
    expect(validateSpy).toHaveBeenCalledWith(rawInputs);
    expect(repoSpy).toHaveBeenCalledWith();
    expect(syncSpy).toHaveBeenCalledWith({ repo: REPO, ...VALIDATED_INPUTS });
    expect(result).toBe(SYNC_RESULT);
  });

  test('execute_validatorThrows_propagatesWithoutSyncing', async () => {
    // Given
    jest.spyOn(Validator.getInstance(), 'inputValidation').mockImplementation(() => {
      throw new ValidationError('Input "source-branch" is required');
    });
    const syncSpy = jest.spyOn(BranchSyncService.getInstance(), 'sync');

    // When
    const act = Orchestrator.getInstance().execute({});

    // Then
    await expect(act).rejects.toBeInstanceOf(ValidationError);
    await expect(act).rejects.toThrow('Input "source-branch" is required');
    expect(syncSpy).not.toHaveBeenCalled();
  });
});
