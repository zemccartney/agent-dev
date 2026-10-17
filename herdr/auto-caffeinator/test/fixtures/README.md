# Contract evidence

Herdr 0.9.3/protocol 22. `herdr-evidence.json` contains sanitized contract fields, not transcripts. Pi authority was exercised against a disposable real server using a native process named pi and explicit lifecycle reports (a simulator, not a model-backed Pi run). Reports require `session_start_source: startup` to anchor a fresh session before lifecycle reports; an OK acknowledgement alone does not prove authority took effect. Claude evidence was obtained with `herdr agent explain --file ... --agent claude --json` against synthetic working/idle/permission screens. Optional provenance/debug fields unrelated to the consumer were omitted. All production-consumed fields must be represented here or separately tested.

These fixtures validate protocol interpretation; actual Pi/Claude end-to-end behavior still requires the live demo matrix.
