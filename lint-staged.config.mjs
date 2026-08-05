/**
 * lint-staged configuration.
 *
 * - Format and lint staged code.
 * - When any shared source or action entry changes, rebuild every action bundle
 *   and re-stage the `dist` output so the committed bundle is always in sync
 *   with the source.
 */
export default {
  '*.{ts,mjs,cjs,js}': ['prettier --write'],
  '*.ts': ['eslint --fix'],
  '{gforce-gha-src/**/*.ts,.github/actions/*/index.ts}': () => [
    'npm run bundle:all',
    // `:(glob)` magic pathspec so `*` matches the action dir (a plain pathspec
    // with `*` does not match across `/` in git add).
    'git add :(glob).github/actions/*/dist/**',
  ],
};
