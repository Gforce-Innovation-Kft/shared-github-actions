/**
 * Hand-rolled Octokit fake for client unit tests. Clients are the one layer
 * allowed to see the SDK, so their tests inject this fake through the public
 * constructor; everything above the client layer mocks at the singleton
 * boundary instead.
 */
import type { OctokitType } from '../../clients/github';

export interface FakeOctokit {
  readonly rest: {
    readonly repos: {
      readonly compareCommitsWithBasehead: jest.Mock;
      readonly getBranch: jest.Mock;
      readonly merge: jest.Mock;
    };
    readonly git: {
      readonly updateRef: jest.Mock;
    };
    readonly pulls: {
      readonly list: jest.Mock;
      readonly create: jest.Mock;
      readonly update: jest.Mock;
      readonly requestReviewers: jest.Mock;
    };
    readonly issues: {
      readonly addLabels: jest.Mock;
    };
  };
}

export function createFakeOctokit(): FakeOctokit {
  return {
    rest: {
      repos: {
        compareCommitsWithBasehead: jest.fn(),
        getBranch: jest.fn(),
        merge: jest.fn(),
      },
      git: {
        updateRef: jest.fn(),
      },
      pulls: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        requestReviewers: jest.fn(),
      },
      issues: {
        addLabels: jest.fn(),
      },
    },
  };
}

/** Test-only widening of the fake into the client's constructor parameter type. */
export function asOctokit(fake: FakeOctokit): OctokitType {
  return fake as unknown as OctokitType;
}
