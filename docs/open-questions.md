# Open questions

## Decided

- 2026-11-04: Each project lives in one folder, `~/.mr-handy/<project>/`, which holds its plan and its wiki.
- 2026-11-04: Knowledge that spans projects goes in one universal wiki under `~/.mr-handy/`, outside every project folder.
- 2026-11-04: The coordinator always hands work to T3 threads, and checks that the T3 tools are available before it starts. Step threads post status updates to their coordinator. The coordinator pushes status updates to Mister Handy through a command line tool.
- 2026-11-04: Every step thread launches with `/poteto-mode`, swarms and panels included, with no extra limits for now. Its cost gets revisited once real projects have run under it.
- 2026-11-04: Mister Handy has a home page listing every project, and one project page per project.
- 2026-11-04: A link to a thread opens it in T3 Code through the deep link `t3code://threads/<environmentId>/<threadId>`.
- 2026-11-04: The pages can be served over the user's Tailscale network, so they open from any of the user's devices.

## Open

1. **What the coordinator may do without asking.** It will be launched from a skill or an agent prompt. That prompt is where its permissions get written.
2. **Status updates versus live facts.** Whether a step's state comes from the status updates threads post, or from T3 and GitHub directly, with the updates only recording which thread and pull request belong to which step.
3. **What the home page shows.** Beyond the list of projects, whether it also pulls out the steps that need the user, across all projects.
4. **Threads outside any project.** Ad hoc work, like the log-leak fixes, is most of the thread volume. Whether it shows up as unassigned threads, or stays off the pages.
