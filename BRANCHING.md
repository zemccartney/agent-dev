# Branch policy

## Long-lived branches

- **`main`** is the GitHub default and the public, release-aligned branch used by Herdr's default-branch installation flow. Do not land unfinished feature work here.
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

Pi-lence uses a manually prepared release branch: feature PR → `dev` → **Prepare Pi-lence release (choose dev)** → `changeset-release/main` PR → `main`. Preparation is create-only; never refresh an existing release branch from moving `dev`. Manually merging the release PR authorizes staging, **not npm publication**. See [RELEASING.md](RELEASING.md) for flowcharts and recovery, and [DEVELOPMENT.md](DEVELOPMENT.md) for the detailed protocol.

For maintenance needed on `main` immediately, start a maintenance PR from `main`, then back-sync through a disposable PR branch to `dev`. Do not merge moving `dev` wholesale just to promote a fix. Before preparing the next release, back-sync accepted versions/changelog, consumed-note deletions, fixes and main ancestry while preserving newer dev work. Herdr publication remains separate.

Release work must account for all changes being promoted. Package-specific versions or changelogs do not selectively filter a Git merge. For artifact-based installers, publish and verify the immutable artifact before advertising its installer/checksum/manifest metadata on `main`.

Creating `dev` does not authorize merging existing feature branches, publishing a release, or installing a plugin into a user's normal Herdr namespace.

## Enforcement and initial setup

Keep `main` as the GitHub default rather than changing it to solve PR-base selection. Protected branches require current macOS checks; release preparation and staging have additional workflow guards. Human acceptance of the release PR and owner approval of npm publication remain separate decisions. Ordinary development or maintenance merges do not prepare or stage a release.

### Historical initial setup

`dev` was initially based on local `main` at `8e09c47f768361db8fc58cbf39a3e65427f51999`, preserving its four documentation commits beyond the then-published `origin/main` (`f34dd13b724a872105d11b844eb7da137545abec`). Published `main`, the original checkout's uncommitted work, and both existing feature branches were left untouched by this setup.
