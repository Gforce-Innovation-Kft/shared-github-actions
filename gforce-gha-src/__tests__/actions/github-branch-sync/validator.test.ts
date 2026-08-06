import { Validator } from '../../../actions/github-branch-sync/validator';
import { ValidationError } from '../../../utils/errors';

const VALID_RAW_INPUTS = {
  'source-branch': 'develop',
  'target-branch': 'main',
  strategy: 'auto',
  'dry-run': 'false',
  'github-token': 'test-token',
};

afterEach(() => {
  Validator.resetInstance();
});

describe('Validator (github-branch-sync)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Validator.getInstance();

    // When
    const second = Validator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('inputValidation_allInputsValid_returnsNormalizedInputs', () => {
    // Given
    const rawInputs = VALID_RAW_INPUTS;

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result).toEqual({
      sourceBranch: 'develop',
      targetBranch: 'main',
      strategy: 'auto',
      dryRun: false,
      githubToken: 'test-token',
    });
  });

  test('inputValidation_blankOptionalInputs_defaultsStrategyAutoAndDryRunTrue', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, strategy: '', 'dry-run': '' };

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result.strategy).toBe('auto');
    expect(result.dryRun).toBe(true);
  });

  test('inputValidation_missingSourceBranch_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'source-branch': '' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "source-branch" is required');
  });

  test('inputValidation_missingGithubToken_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'github-token': '  ' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "github-token" is required');
  });

  test('inputValidation_sameSourceAndTarget_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'source-branch': 'main', 'target-branch': 'main' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('source-branch and target-branch must be different');
  });

  test('inputValidation_unknownStrategy_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, strategy: 'rebase' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow(
      'Input "strategy" must be one of: auto, fast-forward, merge (received "rebase")',
    );
  });

  test('inputValidation_nonObjectPayload_throwsValidationError', () => {
    // Given
    const rawInputs = 'not-an-object';

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected raw inputs to be an object');
  });

  test('inputValidation_nonStringInputValue_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'dry-run': 42 };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "dry-run" must be a string');
  });
});
