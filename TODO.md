# TODO

- [ ] **Add proper development tooling; manage pi-lence as a full project.**
  - Set up pnpm and a project-local `tsconfig.json`.
  - Add consistent verification scripts, proper automated tests, linting, and formatting.
  - Apply the same verification standards to other projects, using tooling appropriate to each project's language.

- [ ] **Make agent messages more visually distinct in pi-lence.**
  - Assistant messages currently feel too subtle as plain text beside user messages with colored backgrounds.
  - Revisit clear, restrained markings that make speaker boundaries easier to scan.

- [ ] **Revisit the visibility of recoverable tool errors after a week of use.**
  - Shell commands often exit with an error, but the agent recovers and continues; displaying every failure may mostly add noise.
  - Treat this as an open question, not a decision to hide errors. Gather trial feedback before changing the current behavior.
  - Distinguish recovered intermediate failures from unresolved problems that require attention; keep details retrievable.

- [ ] **Explore hiding routine thinking summaries and process narration.**
  - Examples: “Checking commit signing” and “Verifying installed CLI.” These examples are model-generated thinking blocks, not tool output or pi-generated logs.
  - Pi's default Ctrl+T shortcut collapses thinking blocks; pi-lence currently leaves thinking visibility unchanged.
  - Consider a quieter presentation while preserving useful questions, decisions, warnings, and results. Ordinary assistant progress messages are a separate category from thinking blocks.
