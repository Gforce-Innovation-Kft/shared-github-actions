import { Orchestrator } from '../../../actions/sf-apex-test-select/orchestrator';
import { Validator } from '../../../actions/sf-apex-test-select/validator';
import { ApexTestSelectionService } from '../../../libraries/salesforce/services/apex-test-selection-service';
import type { ApexTestSelectionResult } from '../../../libraries/salesforce/models/types';
import type { ValidatedSfFindTestsInputs } from '../../../types';
import { ValidationError } from '../../../utils/errors';

const VALIDATED_INPUTS: ValidatedSfFindTestsInputs = {
  packageXml: 'delta/package.xml',
  sourceDir: 'force-app',
  testSuffixes: ['Test', '_Test', 'Tests'],
  githubToken: 'test-token',
};

const SELECTION_RESULT: ApexTestSelectionResult = {
  tests: ['InvoiceServiceTest'],
  testCount: 1,
  hasApex: true,
  changedApexNames: ['InvoiceService'],
};

afterEach(() => {
  Orchestrator.resetInstance();
  Validator.resetInstance();
  ApexTestSelectionService.resetInstance();
  jest.restoreAllMocks();
});

describe('Orchestrator (sf-apex-test-select)', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = Orchestrator.getInstance();

    // When
    const second = Orchestrator.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('execute_validInputs_delegatesValidateAndSelectTests', async () => {
    // Given
    const rawInputs = { 'package-xml': 'delta/package.xml' };
    const validateSpy = jest
      .spyOn(Validator.getInstance(), 'inputValidation')
      .mockReturnValue(VALIDATED_INPUTS);
    const selectSpy = jest
      .spyOn(ApexTestSelectionService.getInstance(), 'selectTests')
      .mockReturnValue(SELECTION_RESULT);

    // When
    const result = await Orchestrator.getInstance().execute(rawInputs);

    // Then
    expect(validateSpy).toHaveBeenCalledWith(rawInputs);
    expect(selectSpy).toHaveBeenCalledWith({
      packageXmlPath: 'delta/package.xml',
      sourceDir: 'force-app',
      testSuffixes: ['Test', '_Test', 'Tests'],
    });
    expect(result).toBe(SELECTION_RESULT);
  });

  test('execute_validatorThrows_propagatesWithoutSelecting', async () => {
    // Given
    jest.spyOn(Validator.getInstance(), 'inputValidation').mockImplementation(() => {
      throw new ValidationError('Input "package-xml" is required');
    });
    const selectSpy = jest.spyOn(ApexTestSelectionService.getInstance(), 'selectTests');

    // When
    const act = Orchestrator.getInstance().execute({});

    // Then
    await expect(act).rejects.toBeInstanceOf(ValidationError);
    await expect(act).rejects.toThrow('Input "package-xml" is required');
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
