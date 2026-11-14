# Every change: the owner's standing order, applied by every task

The owner's order of 2026-11-14 (ADR 0005, verbatim there) binds every task in this repository,
whatever the task says: everything derived, generic and inferred; quality unified to the top;
every visual an ergonomic, maximizable simulator on the best library; everything interlinked;
every requirement enforced by a gate. This workflow is how a task honours it without anyone
having to remember; the gates below refuse a change that does not.

1. **Orient.** `majordomus context`; read the rules for the paths you will touch
   (`majordomus context resolve <path>`): at least `project.viz-ergonomics`,
   `project.everything-interlinked`, `project.front-matter-contract`, `project.data-measured`.
2. **UI.** Any markup, style or visual follows the skill `majordomus://skill/fleet-flowbite-pro`:
   pick the Pro block first, adapt it, verify it. Charts and graphs follow the owner's ECharts
   standard (`~/.claude/skills/echarts-viz-layer`).
3. **A visual is a simulator.** Register it with `KorczisHub.viz`; return `controls()` (at least one
   parameter that changes the model), `resize()`, `items()`; navigate with `ctx.go`, link with
   `ctx.link`, time with `ctx.motion()`. The layer gives it the toolbar, the maximized view, the URL
   state and the resize. Declare `static: '<reason>'` only for a decorative, aria-hidden visual.
4. **Nothing typed that data can give.** A count, a list, a link or a page that a generator can
   derive is derived, with a `--check`; a fact no source holds goes to a file the owner fills.
5. **Every text in every language** (`i18n/<feature>.toml`), every mark linked to its page.
6. **Prove it.** `npm run check` while working, `npm run verify` (one browser launch) before the
   change lands; a new gate is shown failing on the defect it targets before it is trusted.
7. **Land it** through the repository's flow: a branch in `korczis.github.io-wt/<branch>`, the
   pre-commit `doctor`, the pre-push `finish --check`, CI, then master.
