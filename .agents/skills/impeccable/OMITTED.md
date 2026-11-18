# Omitted from the upstream skill

Upstream: https://github.com/pbakaus/impeccable
Commit: d41d9860b0094dcb68030657da63461212835aaa

Not vendored:

- `skill/scripts/**` — launcher downloads a release binary from GitHub, and `live-browser.js` is injected into the page and calls a localhost server with a token.
- `skill/reference/hooks.md` — installs post-edit design hooks into Cursor, Claude, Codex, Copilot, and Hermes settings.
- `skill/reference/live.md`, `live-setup.md`, `generate.md` — live variant mode and page injection, including CSP edits so the page can load `http://localhost`.
- `skill/reference/doctor.md` — repair flow that points at `npx impeccable update`.
- `skill/reference/foundations.md` — scans the repo for private keys and secrets.
- `skill/agents/**` and `skill/hermes-plugin/**` — subagents and a Python plugin for the live edit protocol.
- `cursor-plugin/hooks/**` — hook manifest.

Reference markdown that remains was stripped of lines that invoke the engine, `npx impeccable`, `detect.js`, or the live server.
