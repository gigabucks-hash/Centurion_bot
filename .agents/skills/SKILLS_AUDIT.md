# Skill audit

Read on 2026-11-18 before anything was copied into this repo. Only plain markdown guidance was vendored. No installer was run, and no package was added for these skills.

## web-design-guidelines — installed, fetch stripped

- Source: https://github.com/vercel-labs/agent-skills (`skills/web-design-guidelines`)
- Commit: `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`
- Rules snapshot: https://github.com/vercel-labs/web-interface-guidelines (`command.md`)
- Rules commit: `434b7f91364665f2f733b310ec54809bf8f37937`
- License: MIT (`web-interface-guidelines/LICENSE`, Copyright (c) 2025 Vercel Labs)

The skill entry file is 41 lines. It tells the agent to download `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` on every review. The same repo's `install.sh` curls that file into `~/.cursor`, `~/.claude`, and similar directories. `command.md` itself is a static rule list (accessibility, focus, forms, motion, type, images). No scripts, no secrets, no wallet instructions.

Vendored: `SKILL.md` rewritten to read the local `guidelines.md` snapshot, plus `guidelines.md` and `LICENSE`. `install.sh` was not copied. The installed skill does not fetch a remote URL.

## react-best-practices — installed

- Source: https://github.com/vercel-labs/agent-skills (`skills/react-best-practices`)
- Commit: `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`
- License: the skill frontmatter says MIT. That commit has no `LICENSE` file. `NOTICE.md` records that.

76 files: `SKILL.md`, `README.md`, `AGENTS.md`, `metadata.json`, and markdown rules under `rules/`. No scripts. `metadata.json` lists documentation URLs as citations. A few rules show `fetch()` in example code for an app's own `/api` routes. Nothing asks the agent to call a remote URL, install a package, read a secret, or touch a wallet.

Useful here as a check against `transition: all` and layout-thrashing renders. Vendored as-is, plus `NOTICE.md`.

## make-interfaces-feel-better — installed

- Source: https://github.com/jakubkrehel/make-interfaces-feel-better
- Commit: `6d9f2f1df10e8ce2ae1708598a73b0506fb98794`
- License: MIT (Copyright (c) 2026 Jakub Krehel)

Files read: `SKILL.md`, `typography.md`, `surfaces.md`, `animations.md`, `icons.md`, `performance.md`, `agents/openai.yaml`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `LICENSE`. All guidance. `openai.yaml` is a display name and a one-line description. The README's install line is `npx skills add …`; that command was not run, and the README was not copied. No runtime fetch, no script, no secret, no wallet.

Vendored: the skill directory and `LICENSE`.

## impeccable — installed, engine and live mode omitted

- Site: https://impeccable.style
- Source: https://github.com/pbakaus/impeccable
- Commit: `d41d9860b0094dcb68030657da63461212835aaa`
- License: Apache-2.0

The skill folder mixes design writing with a launcher. `skill/scripts/impeccable` and `impeccable.cmd` download a release binary from `https://github.com/pbakaus/impeccable/releases/download`. `live-browser.js` is injected into the page and calls a localhost server with a token (manual edits, source reads, annotations). `reference/hooks.md` installs post-edit hooks into Cursor and other harnesses. `reference/live.md`, `live-setup.md`, and `generate.md` drive that injector, including a development CSP allowance for `http://localhost`. `reference/foundations.md` scans tracked files for private keys and secrets. `reference/doctor.md` points at `npx impeccable update`. `skill/agents/` and `skill/hermes-plugin/` serve the live-edit protocol.

Those files were not copied. See `impeccable/OMITTED.md`.

The remaining `reference/*.md` files are design writing (polish, layout, type, motion, critique, audit, and the rest of the command set except the five omitted above). Lines that invoked the engine, `npx impeccable`, `detect.js`, or the live server were removed. `critique.md` no longer tells the agent to append a script tag or open a debugger port. Each kept file starts with a banner that forbids downloading the engine.

No wallet or transfer instructions were in the files that were kept.
