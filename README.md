# agent-dev

Agentic coding tools and configuration, organized by the app they extend.

## Projects

- **[pi-lence](pi/pi-lence/README.md)** — a quieter Pi conversation, with a response browser, named pins, Quiet/Raw tool display, and a delayed activity warning.
- **[auto-caffeinator](herdr/auto-caffeinator/README.md)** — automatic, time-bounded caffeination of local Pi and Claude Code runs on macOS. See its [guided demo](herdr/auto-caffeinator/docs/demo.md).
- **[agentlog](herdr/agentlog/README.md)** — find, organize, and reopen saved Pi conversations from Herdr.

[Changelogs](CHANGELOG.md)

## Development

From a reviewed checkout on `dev`, use the pinned mise toolchain:

```sh
mise trust
mise run setup
mise run check
```

See the [development guide](DEVELOPMENT.md) and [maintenance notes](MAINTENANCE.md).
