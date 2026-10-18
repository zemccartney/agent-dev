# Release notes

From the repository root, create a note interactively:

```sh
mise exec -- pnpm exec changeset add
```

Select the affected package(s), choose the appropriate bump, and describe the
consumer-visible change. Commit the generated Markdown note with the change.
Projects version independently; the Herdr packages remain private to npm.
Maintenance-documentation edits and other changes with no release impact need
no note or empty placeholder. Planned PR reminders will be non-blocking.

Pi-lence's unpublished baseline is `0.0.0`. For its first release, select only
`@grepco/pi-lence`, choose **minor**, and write the initial-release summary; later
version preparation will produce the chosen public `0.1.0`.

Creating a note does not change versions, commit files or publish anything.
Changesets will consume notes and generate versions/changelogs during explicitly
requested release preparation. Do not run `changeset publish`: the selected
workflow will use native npm staging with final npm/2FA approval, and that
publishing integration is not yet implemented.

See [DEVELOPMENT.md](../DEVELOPMENT.md#release-notes-with-changesets) for inspection,
formatting and release-boundary details.
