# CLAUDE.md

## `dist/`

The action runs from the committed `dist/index.js`, built by `npm run bundle`.
`check-dist.yml` fails any PR whose `dist/` differs from a fresh build.

- Never include `dist/` in a source commit.
- Right before creating a PR, run `npm ci && npm run bundle` and commit only
  `dist/` as a separate commit at the tip of the branch: `Rebuild dist/`.
- Keep exactly one such commit per PR, always at the tip. When the branch gets
  new commits, drop the old `Rebuild dist/` commit, rebuild, and recreate it at
  the tip. This history rewrite and its `git push --force-with-lease` are
  pre-authorized for the `Rebuild dist/` commit only.
- Skip the commit when the rebuild leaves `dist/` unchanged.
