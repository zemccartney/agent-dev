# Branch policy

## Long-lived branches

- **`main`** is the GitHub default and public, release-aligned branch. Reviewed Herdr source may be included before its separate release machinery is ready; that does not advertise a working public installer or authorize Herdr publication.
- **`dev`** is the integration branch. Start new feature/fix branches from `dev` and merge reviewed work back into `dev`.

Because GitHub's default remains `main`, explicitly choose **`dev` as the base of ordinary pull requests**. The default PR target is not the development policy.

```sh
git fetch origin
git switch -c feat/my-change origin/dev
# Work, verify, and commit on the feature branch.
git push -u origin feat/my-change
gh pr create --base dev
```

Do not switch branches in a dirty working tree just to follow this example. Preserve other work or use an isolated worktree:

```sh
git fetch origin
git worktree add -b feat/my-change .worktrees/my-change origin/dev
```

## Releases

Pi-lence uses a manually prepared release branch: feature PR → `dev` → **Prepare Pi-lence release (choose dev)** → `changeset-release/main` PR → `main`. Preparation is create-only; never refresh an existing release branch from moving `dev`. Manually merging the release PR authorizes staging, **not npm publication**. See [RELEASING.md](RELEASING.md) for flowcharts and recovery, and [release protocol](RELEASE-PROTOCOL.md) for safeguards and setup.

For maintenance needed on `main` immediately, start a maintenance PR from `main`, then back-sync through a disposable PR branch to `dev`. Do not merge moving `dev` wholesale just to promote a fix. Before preparing the next release, back-sync accepted versions/changelog, consumed-note deletions, fixes and main ancestry while preserving newer dev work. Herdr publication remains separate.

Release work must account for all changes being promoted. Package-specific versions or changelogs do not selectively filter a Git merge. For artifact-based installers, publish and verify the immutable artifact before advertising its installer/checksum/manifest metadata on `main`.

Creating `dev` does not authorize merging existing feature branches, publishing a release, or installing a plugin into a user's normal Herdr namespace.

## Enforcement and initial setup

Keep `main` as the GitHub default rather than changing it to solve PR-base selection. Protected branches require current macOS checks; release preparation and staging have additional workflow guards. Human acceptance of the release PR and owner approval of npm publication remain separate decisions. Ordinary development or maintenance merges do not prepare or stage a release.
