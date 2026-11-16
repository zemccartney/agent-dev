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

Creating a note does not change versions, commit files or publish anything.
Changesets will consume notes and generate versions/changelogs during explicitly
requested release preparation. Do not run `changeset publish`: the selected
workflow uses native npm staging with separate npm website/2FA publication approval.

See the [development guide](../docs/maintenance/DEVELOPMENT.md#changesets-and-releases)
for inspection and formatting, and [release flows](../docs/maintenance/RELEASING.md)
for the approval boundaries.
