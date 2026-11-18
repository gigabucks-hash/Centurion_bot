> **Vendored copy.** The engine launcher, live-browser injector, design hooks, and update downloader are not included. Do not download binaries, run `npx impeccable`, install hooks, inject scripts into a page, or fetch remote skill updates. If a sentence below tells you to run a script or open a localhost live server, skip that sentence and use the written guidance.

# Command guidance

## Workflow questions

Give advice without executing commands; the menu below is only for bare invocations. Consult relevant command references as needed for prerequisites and scope. Link to the [docs](https://impeccable.style/docs/) for the broader workflow guide. If the user also requests execution, follow that request.

## No-argument routing: the context-aware menu

Read this when the user invokes `{{command_prefix}}impeccable` with no argument. They are asking "what should I do?" Make the menu context-aware instead of static.


Reason over the signals; there is no score to obey:

- `setup.hasDesign` false while `setup.hasCode` true → `document` (capture the visual system).
- `critique.latest` is `null` → the project has never been critiqued; for a set-up project with a real surface, offering `/impeccable critique <surface>` is a strong default.
- `critique.latest` with a low `score` or non-zero `p0` / `p1` → `polish` (it reads that snapshot as its backlog and closes it when stale or cleared).
- `git.changedFiles` pointing at one surface → scope `audit` or `polish` to those files specifically, naming them.
- `devServer.running` true → `live` is available for in-browser iteration, and `generate` for one-shot variant runs on a named element; if false, don't lead with either. **`live`, `generate`, and the bundled `impeccable detect` are web-only.** If `setup.platform` is `ios`, `android`, or `adaptive`, don't lead with any of them; the browser overlay and the HTML rule engine don't apply to native app code.
- Otherwise group by intent (build new / improve what's there / iterate visually), tailored to the current surface and `setup.platform`.


Keep it to 2-3 pointed picks with the exact command to type. The menu stays the fallback; the recommendation is the lede.
