# Open questions

## Decided

- 2026-11-04: Each project lives in one folder, `~/.mr-handy/<project>/`, which holds its plan and its wiki.
- 2026-11-04: Knowledge that spans projects goes in one universal wiki under `~/.mr-handy/`, outside every project folder.
- 2026-11-04: The coordinator always hands work to T3 threads, and checks that the T3 tools are available before it starts. Step threads post status updates to their coordinator. The coordinator pushes status updates to Mister Handy through a command line tool.
- 2026-11-04: Every step thread launches with `/poteto-mode`, swarms and panels included, with no extra limits for now. Its cost gets revisited once real projects have run under it.
- 2026-11-04: Mister Handy has a home page listing every project, and one project page per project.
- 2026-11-04: A link to a thread opens it in T3 Code through the deep link `t3code://threads/<environmentId>/<threadId>`.
- 2026-11-04: The pages can be served over the user's Tailscale network, so they open from any of the user's devices.
- 2026-11-04: The plan can change at any time, so `mr-handy` gets commands that edit the plan (add, rewrite, split or drop a step, and add or remove a dependency), not only status updates.
- 2026-11-04: Tracer bullets and blocker steps are dropped. The plan alone dictates what each step is.
- 2026-11-04: The coordinator does no housekeeping either. Rebases, restacks and review fixes all go to a step thread.
- 2026-11-04: The coordinator runs from the `/coordinator` skill, which lists what it may do without asking. Step threads are top-level T3 threads launched into a worktree, and they report back by messaging the coordinator thread.
- 2026-11-06: The coordinator skill holds the protocol, and the user's profile at `~/.mr-handy/profile.md` holds the policy: planning method, brief preamble and rules, branch template, tracker and extra ask-first actions. Step threads launch with the profile's preamble, which replaces the always-`/poteto-mode` decision above.

## Open

1. **Handing a project to a new coordinator thread.** `mr-handy` refuses `project create` from a second thread, so a resumed coordinator in a new thread can't record itself and the project page keeps linking to the old one.
2. **Status updates versus live facts.** Whether a step's state comes from the status updates threads post, or from T3 and GitHub directly, with the updates only recording which thread and pull request belong to which step.
3. **What the home page shows.** Beyond the list of projects, whether it also pulls out the steps that need the user, across all projects.
4. **Threads outside any project.** Ad hoc work, like the log-leak fixes, is most of the thread volume. Whether it shows up as unassigned threads, or stays off the pages.
