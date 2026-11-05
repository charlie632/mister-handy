# Working patterns (mined 2026-11-04)

Source: 831 Claude Code sessions (2026-09-17 → 2026-11-04, all projects), 82 Codex sessions, `~/.claude/orchestrate/*`, `~/Vault`, `~/.claude/skills`. Only the user's typed messages were mined. Agent-written briefs were read as evidence of how delegation works, not as the user's own voice. Strength counts slices out of four (A: to 10-13, B: 10-14..21, C: 10-22..27, D: 10-28..11-04).

## Conventions (seen in 3–4 slices)

**Response style**

- Answer first, short. "TL;DR?", "too long", "just answer", "one liner" for Slack.
- Give a recommendation, not a list of options ("What is your recommendation?").
- Present decisions as a numbered list, one at a time, so the user can answer inline.
- "Don't act" means explain only. Explanations often get put into a lasting place: the PR body, a code comment, an issue, or a `/show-me` HTML.
- Messages are often dictated, so typos are normal. Swearing means the agent overreached or got something wrong.

**Delegation**

- Keep the main thread clean. Side work goes to a new T3 thread or a subagent, and the main thread doesn't wait for it.
- One thread owns a doc or epic, and other threads report to it ("tell [Thread: RFC Document] about the new tickets").
- Child briefs have a fixed shape: Goal, Why or Evidence, touchpoints ("grep for more, don't trust this list"), Rules and scope, Report back.
- A child checks that no PR exists for the work before it starts.
- Pick the model per role and keep fan-out low. The user asks "why did you use a subagent / launch codex agents?" when either is unrequested.
- Codex is used mostly as an independent reviewer (`$review-agent <PR>`). Implementation runs in Claude through T3.
- The judge pattern: two competing branches, a read-only Fable judge, and fixes applied to the winner.

**Verification**

- Done means the PR is open, CI is green and bot reviews (qodo, claude-bot, `/cerby-pr-review`) are triaged. Don't run long suites locally when CI will run them.
- Performance and infra changes need a live measurement: Datadog APM, dev EKS or ECS, or production data.
- `/code-review` findings are numbered and the user rules on each: fix, ignore, or follow-up ticket. Default to fixing critical findings and deferring lows and mids.
- Distrust numbers and tests that don't earn their place. Delete tautological tests.
- UI PRs get screenshots or video attached with `gh --attach`.

**Code and prose**

- Big changes are additive and opt-in, behind a toggle. PRs stay small. API changes go in their own PR, and large sweeps split at roughly 50 files per PR.
- Comments say why, are verified, and carry no ticket references.
- Scope isolation beats DRY.
- `/unslop` runs on all human-facing prose. Docs for the team are written neutrally, not addressed to one person.

**Process**

- "create a PR" ends most tasks, and branches follow `charlie632/<type>/<slug>`.
- Rebase from main with `--force-with-lease`, and check that Alembic has a single head.
- GitHub posts carry the robot header. The exceptions are `/cerby-pr-review` trigger comments and self-DMs.
- Slack is used for reminders, scheduled self-messages and one-line incident posts.
- Preferences go into skills, not memories. Skills get fixed while they are being used.

## Recurring friction

- T3 restarts kill background work. "Continue where you left off" appears 11+ times and `/compact` 30+ times.
- Babysit logic has been rebuilt many times. GitHub GraphQL rate limits.
- Worktrees and disk pile up: 62 lane worktrees (37 GB) were pruned by hand.
- The Vault doesn't know about current epics. `/project` and `/rollup` don't read `~/.claude/orchestrate`.
