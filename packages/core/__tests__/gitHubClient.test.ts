import { GitHubClient } from '../src/github-service/client/gitHubClient';
import { ValidationError } from '../src/utils/errors/errors';

describe('GitHubClient', () => {
  afterEach(() => GitHubClient.resetInstance());

  it('returns the same shared client across calls with the same token', () => {
    const first = GitHubClient.getInstance('token');
    const second = GitHubClient.getInstance('token');
    expect(second).toBe(first);
    expect(first.octokit).toBeDefined();
  });

  it('throws when a different token is requested for the shared client', () => {
    GitHubClient.getInstance('token-a');
    expect(() => GitHubClient.getInstance('token-b')).toThrow(ValidationError);
  });

  it('newInstance always builds a fresh, isolated client', () => {
    const shared = GitHubClient.getInstance('token');
    const fresh = GitHubClient.newInstance('token');
    expect(fresh).not.toBe(shared);
    expect(GitHubClient.newInstance('token')).not.toBe(fresh);
  });

  it('rebuilds the shared client after reset and allows a new token', () => {
    const first = GitHubClient.getInstance('token-a');
    GitHubClient.resetInstance();
    const second = GitHubClient.getInstance('token-b');
    expect(second).not.toBe(first);
  });
});
