import { readRepoFromEnvironment } from '../src/readRepoFromEnvironment';

describe('readRepoFromEnvironment', () => {
  const original = process.env.GITHUB_REPOSITORY;

  afterEach(() => {
    process.env.GITHUB_REPOSITORY = original;
  });

  it('parses owner/repo from GITHUB_REPOSITORY', () => {
    process.env.GITHUB_REPOSITORY = 'gforceinnovation/demo';
    expect(readRepoFromEnvironment()).toEqual({ owner: 'gforceinnovation', repo: 'demo' });
  });

  it('throws when GITHUB_REPOSITORY is unset', () => {
    delete process.env.GITHUB_REPOSITORY;
    expect(() => readRepoFromEnvironment()).toThrow(/owner\/repo/);
  });
});
