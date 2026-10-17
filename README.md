# agent-dev

Agentic coding tools and configuration, organized by the app they extend.
Each project owns its package metadata, code, tests, and documentation; there
is no root npm package.

## Projects

- **[pi-lence](pi/pi-lence/README.md)** — a quieter pi conversation, with a response
  browser, named pins, Quiet/Raw tool display, and an amber warning after a minute
  without model/tool updates. First trial release; tested with pi 1.1.0's
  fullscreen TUI in Herdr.
- **[auto-caffeinator](herdr/auto-caffeinator/README.md)** — automatic, time-bounded caffeination of local Pi and Claude Code runs on macOS. See its [guided demo](herdr/auto-caffeinator/docs/demo.md).
- **[agentlog](herdr/agentlog/README.md)** — find, organize, and reopen saved Pi conversations from Herdr.

## Install pi-lence

With [pi](https://pi.dev) already installed:

```sh
git clone https://github.com/zemccartney/agent-dev.git
cd agent-dev
pi install ./pi/pi-lence
pi
```

Run the install command once per machine. It registers this local package in
pi's personal settings, so subsequent launches load it without `-e`, from any
working directory. No build or `npm install` step is needed. Keep the checkout
at its installed location; see the [package README](pi/pi-lence/README.md) if you
move it or want to uninstall.

This trial uses a Git checkout, not a root-level pi package or an npm release.
Installing pi-lence does not install or configure Herdr projects.

## Update and iterate

On a machine consuming pushed changes:

```sh
cd /path/to/agent-dev
git pull --ff-only
```

Then restart pi or run `/reload` in an existing session. Local-path packages
are not updated or checked for updates by pi; Git handles this workflow.

On a development machine, edit the local package, run its checks, and use
`/reload` to try the changes:

```sh
cd pi/pi-lence
npm test
npm run test:integration -- /path/to/node_modules/@earendil-works/pi-coding-agent
```

Commit and push only the intended files, particularly when other agents are
working in the same checkout. Existing pins remain in pi's session files; the
repository contains extension code, not conversation data.

Npm publishing is deferred. A future standalone `pi-lence` release can use pi's
package update notifications without changing this monorepo layout.

## Ideas

[Scratch ideas](docs/ideas.md) are possibilities to revisit, not a committed roadmap.

## License

[MIT](LICENSE) covers the repository's original work unless explicitly stated
otherwise. Third-party code retains its own license. Future standalone package
archives must include the root license text.
