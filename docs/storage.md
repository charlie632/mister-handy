# Storage

Status: draft, 2026-11-04.

One SQLite database, `~/.mr-handy/mister-handy.db` unless `MR_HANDY_DB` names another file, holds everything the pages show, for every project. Free-form text lives elsewhere. Each project's wiki and the prose of its plan are Markdown files under `~/.mr-handy/<project>/`. The pages never read those files, so anything a page shows has to be in the database.

## What is stored and what is computed

The database stores three kinds of row:

- **Intent.** What the coordinator and the user decided. Projects, plan steps, dependencies, holds, and the manual Done and Dropped marks.
- **Links.** Which thread and which pull requests belong to which step. They arrive as status updates from the command line tool, because nothing else knows them.
- **Observations.** The last thing seen in T3, GitHub or Jira about a thread, a pull request or a ticket, with the time it was seen.

Step state is never stored. The domain package computes it from these rows at read time, with one function (`deriveStepNodes`) that every page uses. Storing it would create a second copy that goes stale the moment a thread dies without reporting. That's the case the T3 restarts in the user's history keep producing.

## Who writes what

Each writer owns its own tables, so no two writers ever update the same row.

| Writer                                                             | Writes                                                                                                                                            | Never writes                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `mr-handy` command line tool, run by coordinators and step threads | `project` (inserted in Planning), `plan_step`, `dependency`, `step_thread`, `step_pull_request`, `status_update`, and Dropped through `closeStep` | Observations, `project.state` |
| Sync loop, polling T3, GitHub and Jira                             | `thread_observation`, `pull_request_observation`, `ticket_observation`                                                                            | Intent or links               |
| Web app, for the user                                              | `project.state`, and Done or Dropped through `closeStep`                                                                                          | Everything else               |

Two writers do share a table. The web app and the command line tool both write `project` and `plan_step`, and apart from the close mark always different columns. SQLite in WAL mode serializes the writes.

The close mark, `plan_step.closed_as` and `plan_step.closed_at`, is written only through `closeStep` in `packages/db`, so both writers follow one rule: the first mark wins. The web app marks a step Done or Dropped, and `mr-handy step drop` marks it Dropped. On Dropped, `closeStep` also rewires `dependency` in the same transaction. Each step that waited on the dropped step waits on the dropped step's own dependencies instead, and the dropped step's edges are deleted. Otherwise a waiter would stay Blocked forever, because Dropped never counts as finished, or turn Ready before the work it needed was done.

## Schema

The tables live in [`packages/db/src/schema.sql`](../packages/db/src/schema.sql), the one copy that `mr-handy db init` applies. Every statement there is `CREATE TABLE IF NOT EXISTS`, so running init again changes nothing. The two pragmas are per connection rather than part of the file: WAL mode is set when a connection opens, and `mr-handy db load` turns on `foreign_keys` before it runs a script.

Notes on the shape:

- **Steps have their own ids, and the ticket key is a nullable column.** During Planning a step exists before its ticket is filed. A step without a ticket is a to-do for the coordinator.
- **A step can have several step threads.** When a thread dies and the coordinator starts another one, both rows stay. The node links to the newest one by `started_at`.
- **Observations are one row per thing, overwritten on each poll.** The history of what happened lives in `status_update`, not in old observations.
- **A hold is `plan_step.held_for`**, the decision the coordinator is waiting on, as text. Only the command line tool writes it, through `mr-handy step hold` and `step release`. Holding again with the same reason changes nothing; a new reason replaces the old one.
- **`Missing`** is a thread state that only the sync loop sets. It means T3 no longer knows the thread, for example because another machine owns it. A step whose newest thread is Missing reads as Needs you.
- **Cycles in `dependency` can't be blocked by a CHECK.** The command line tool rejects an edge that would close a cycle before it writes.

## Retries and crashes

Every write converges, whether it runs once or several times:

- `status_update.id` is derived by `mr-handy` from the update: `StepStarted:<project>:<step>:<environment>/<thread>` or `PullRequestOpened:<project>:<step>:<url>`. A retried `mr-handy status` derives the same id, and the insert does nothing on conflict.
- Plan edits compare against what is stored. Adding a step that already exists with the same title and ticket, or a dependency that is already there, changes nothing. A rerun that disagrees with what is stored is refused and writes nothing. Each command runs in one transaction, so a crash never leaves half an edit.
- `closeStep` keeps the first mark. Marking a closed step again changes nothing, so dropping a Done step, or a retried drop, neither moves an edge nor changes the mark.
- Link rows are keyed by what they link. The thread for `step_thread`, the URL for `step_pull_request`. Reposting the same update writes the same row.
- The sync loop overwrites observations wholesale. A crash halfway through leaves some rows older than others, and the next poll catches them up. Every page shows `observed_at`, so stale data is visible, not hidden.

## How step state is computed

The rules are the ones in `CONTEXT.md`, applied in this order, with the first match winning:

1. `closed_as` is set. The state is Done or Dropped.
2. Every pull request observed as Merged, at least one of them. The state is Merged.
3. `held_for` is set. The state is Needs you.
4. The newest step thread is observed Running. The state is Working.
5. Any pull request is Open or Draft. The state is In review.
6. A step thread exists and is Waiting, Idle, Failed or Missing. The state is Needs you.
7. Every step it depends on is Merged or Done. The state is Ready.
8. Otherwise the state is Blocked.

Early start and Drift are flags computed alongside the state, not stored either.
