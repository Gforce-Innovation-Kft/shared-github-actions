import { Validator } from '../../../actions/create-release-pr/validator';
import { ValidationError } from '../../../utils/errors';

const VALID_RAW_INPUTS = {
  'source-branch': 'develop',
  'target-branch': 'main',
  'release-version': 'v1.2.0',
  title: '',
  'body-template': '',
  draft: '',
  labels: '',
  reviewers: '',
  'dry-run': 'false',
  'github-token': 'test-token',
};

afterEach(() => {
  Validator.resetInstance();
});

describe('Validator (create-release-pr)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Validator.getInstance();

    // When
    const second = Validator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('inputValidation_minimalInputs_returnsNormalizedDefaults', () => {
    // Given
    const rawInputs = VALID_RAW_INPUTS;

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result).toEqual({
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
    });
  });

  test('inputValidation_absentOptionalKeys_defaultsTitleAndTemplateToUndefined', () => {
    // Given
    const rawInputs = {
      'source-branch': 'develop',
      'target-branch': 'main',
      'release-version': 'v1.2.0',
      'dry-run': 'false',
      'github-token': 'test-token',
    };

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result.title).toBeUndefined();
    expect(result.bodyTemplate).toBeUndefined();
    expect(result.labels).toEqual([]);
    expect(result.reviewers).toEqual([]);
  });

  test('inputValidation_blankDryRun_defaultsToTrue', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'dry-run': '' };

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result.dryRun).toBe(true);
  });

  test('inputValidation_fullInputs_parsesListsAndFlags', () => {
    // Given
    const rawInputs = {
      ...VALID_RAW_INPUTS,
      title: ' Release candidate ',
      'body-template': ' {{version}} ',
      draft: 'true',
      labels: 'release, automated',
      reviewers: 'gambe94\nsecond-reviewer',
    };

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result.title).toBe('Release candidate');
    expect(result.bodyTemplate).toBe('{{version}}');
    expect(result.draft).toBe(true);
    expect(result.labels).toEqual(['release', 'automated']);
    expect(result.reviewers).toEqual(['gambe94', 'second-reviewer']);
  });

  test('inputValidation_missingReleaseVersion_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'release-version': '  ' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "release-version" is required');
  });

  test('inputValidation_sameSourceAndTarget_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'source-branch': 'main' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('source-branch and target-branch must be different');
  });

  test('inputValidation_nonObjectPayload_throwsValidationError', () => {
    // Given
    const rawInputs = undefined;

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected raw inputs to be an object');
  });
});
