import { Validator } from '../../../actions/sf-find-tests/validator';
import { ValidationError } from '../../../utils/errors';

const VALID_RAW_INPUTS = {
  'package-xml': 'delta/package.xml',
  'source-dir': 'force-app',
  'test-suffixes': '',
  'github-token': 'test-token',
};

afterEach(() => {
  Validator.resetInstance();
});

describe('Validator (sf-find-tests)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Validator.getInstance();

    // When
    const second = Validator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('inputValidation_blankSuffixes_defaultsToStandardSuffixes', () => {
    // Given
    const rawInputs = VALID_RAW_INPUTS;

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result).toEqual({
      packageXml: 'delta/package.xml',
      sourceDir: 'force-app',
      testSuffixes: ['Test', '_Test', 'Tests'],
      githubToken: 'test-token',
    });
  });

  test('inputValidation_customSuffixes_parsesList', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'test-suffixes': 'Spec, UT' };

    // When
    const result = Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(result.testSuffixes).toEqual(['Spec', 'UT']);
  });

  test('inputValidation_missingPackageXml_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'package-xml': '' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "package-xml" is required');
  });

  test('inputValidation_missingSourceDir_throwsValidationError', () => {
    // Given
    const rawInputs = { ...VALID_RAW_INPUTS, 'source-dir': '  ' };

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Input "source-dir" is required');
  });

  test('inputValidation_nonObjectPayload_throwsValidationError', () => {
    // Given
    const rawInputs = null;

    // When
    const act = (): unknown => Validator.getInstance().inputValidation(rawInputs);

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('Expected raw inputs to be an object');
  });
});
