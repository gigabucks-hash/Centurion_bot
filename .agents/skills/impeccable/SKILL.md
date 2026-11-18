---
name: impeccable
description: Use when designing, critiquing, auditing, or polishing a frontend interface. Hierarchy, layout, typography, motion, empty states, and accessibility, inside the existing visual system. This vendored copy is markdown only.
license: Apache-2.0
---

# Impeccable (vendored, markdown only)

Work inside the product's existing colors, type, and components. On an operate surface (dashboard, discovery table, settings), precision and restraint beat a new visual identity.

This copy does **not** include the Impeccable engine. Do not download it, do not run `npx impeccable`, do not install design hooks, and do not inject a live browser script. Those parts of the upstream project fetch a release binary and inject a localhost helper into the page. They were left out on purpose.

## Setup

1. Read the existing tokens, shared components, and the screens in scope. Do not invent a second palette.
2. Load the playbook that matches the request. For a polish pass, read [reference/polish.md](reference/polish.md) and [reference/craft-floor.md](reference/craft-floor.md) before editing.
3. Verify the rendered result. A checklist is not a substitute for looking.

## Modes

- **Persuade:** the visitor decides. Landing pages and pricing.
- **Operate:** the visitor completes a task. Dashboards, tables, tools. This is the mode for Centurion Explore and the dashboard.
- **Read:** the visitor understands something. Docs and changelogs.
- **Experience:** the artifact leads. Portfolios and galleries.

## Commands kept as writing

| Command | Reference |
|---|---|
| polish | [reference/polish.md](reference/polish.md) |
| critique | [reference/critique.md](reference/critique.md) |
| audit | [reference/audit.md](reference/audit.md) |
| layout | [reference/layout.md](reference/layout.md) |
| typeset | [reference/typeset.md](reference/typeset.md) |
| animate | [reference/animate.md](reference/animate.md) |
| shape | [reference/shape.md](reference/shape.md) |
| quieter / bolder / distill | matching files in reference/ |
| harden, onboard, clarify, adapt, optimize, colorize, delight | matching files in reference/ |

`live`, `generate`, `hooks`, `doctor`, and `foundations` are not installed. `foundations` walks the repo looking for secrets. `hooks` writes harness hook files. `live` and `generate` inject a page script. Do not recreate them.
