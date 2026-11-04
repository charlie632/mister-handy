# Storage

Status: draft, 2026-11-04.

One SQLite database, `~/.mr-handy/mister-handy.db`, holds everything the pages show, for every project. Free-form text lives elsewhere. Each project's wiki and the prose of its plan are Markdown files under `~/.mr-handy/<project>/`. The pages never read those files, so anything a page shows has to be in the database.

## What is stored and what is computed

The database stores three kinds of row:

- **Intent.** What the coordinator and the user decided. Projects, plan steps, dependencies, and the manual Done and Dropped marks.
- **Links.** Which thread and which pull requests belong to which step. They arrive as status updates from the command line tool, because nothing else knows them.
- **Observations.** The last thing seen in T3, GitHub or Jira about a thread, a pull request or a ticket, with the time it was seen.

Step state is never stored. The domain package computes it from these rows at read time, with one function that every page uses. Storing it would create a second copy that goes stale the moment a thread dies without reporting. That's the case the T3 restarts in the user's history keep producing.

## Who writes what

Each writer owns its own tables, so no two writers ever update the same row.

| Writer | Writes | Never writes |
|---|---|---|
| `mr-handy` command line tool, run by coordinators and step threads | `project`, `plan_step`, `dependency`, `step_thread`, `step_pull_request`, `status_update` | Observations |
| Sync loop, polling T3, GitHub and Jira | `thread_observation`, `pull_request_observation`, `ticket_observation` | Intent or links |
| Web app, for the user | `project.state`, `plan_step.closed_as`, `plan_step.closed_at` | Everything else |

Two writers do share a table. The web app and the command line tool both write `project` and `plan_step`, but always different columns. SQLite in WAL mode serializes the writes.

## Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE project (
  slug                   TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  state                  TEXT NOT NULL CHECK (state IN ('Planning','Active','Paused','Done')),
  epic_key               TEXT,
  coordinator_env_id     TEXT,
  coordinator_thread_id  TEXT,
  created_at             TEXT NOT NULL,
  CHECK ((coordinator_env_id IS NULL) = (coordinator_thread_id IS NULL))
);

CREATE TABLE project_reference (
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  label         TEXT NOT NULL,
  url           TEXT NOT NULL,
  PRIMARY KEY (project_slug, url)
);

CREATE TABLE plan_step (
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  step_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  ticket_key    TEXT UNIQUE,
  position      INTEGER NOT NULL,
  closed_as     TEXT CHECK (closed_as IN ('Done','Dropped')),
  closed_at     TEXT,
  PRIMARY KEY (project_slug, step_id),
  CHECK ((closed_as IS NULL) = (closed_at IS NULL))
);

CREATE TABLE dependency (
  project_slug  TEXT NOT NULL,
  before_step   TEXT NOT NULL,
  after_step    TEXT NOT NULL,
  PRIMARY KEY (project_slug, before_step, after_step),
  FOREIGN KEY (project_slug, before_step) REFERENCES plan_step(project_slug, step_id),
  FOREIGN KEY (project_slug, after_step)  REFERENCES plan_step(project_slug, step_id),
  CHECK (before_step <> after_step)
);

CREATE TABLE step_thread (
  project_slug    TEXT NOT NULL,
  step_id         TEXT NOT NULL,
  env_id          TEXT NOT NULL,
  thread_id       TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  PRIMARY KEY (env_id, thread_id),
  FOREIGN KEY (project_slug, step_id) REFERENCES plan_step(project_slug, step_id)
);

CREATE TABLE step_pull_request (
  project_slug  TEXT NOT NULL,
  step_id       TEXT NOT NULL,
  url           TEXT NOT NULL PRIMARY KEY,
  opened_at     TEXT NOT NULL,
  FOREIGN KEY (project_slug, step_id) REFERENCES plan_step(project_slug, step_id)
);

CREATE TABLE status_update (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  step_id       TEXT,
  kind          TEXT NOT NULL,
  body          TEXT NOT NULL,
  env_id        TEXT,
  thread_id     TEXT,
  received_at   TEXT NOT NULL
);

CREATE TABLE thread_observation (
  env_id        TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('Running','Waiting','Idle','Failed','Settled','Missing')),
  title         TEXT,
  observed_at   TEXT NOT NULL,
  PRIMARY KEY (env_id, thread_id)
);

CREATE TABLE pull_request_observation (
  url           TEXT PRIMARY KEY,
  state         TEXT NOT NULL CHECK (state IN ('Draft','Open','Merged','Closed')),
  checks        TEXT CHECK (checks IN ('Pending','Passing','Failing')),
  observed_at   TEXT NOT NULL
);

CREATE TABLE ticket_observation (
  ticket_key    TEXT PRIMARY KEY,
  jira_status   TEXT NOT NULL,
  observed_at   TEXT NOT NULL
);
```

Notes on the shape:

- **Steps have their own ids, and the ticket key is a nullable column.** During Planning a step exists before its ticket is filed. A step without a ticket is a to-do for the coordinator.
- **A step can have several step threads.** When a thread dies and the coordinator starts another one, both rows stay. The node links to the newest one by `started_at`.
- **Observations are one row per thing, overwritten on each poll.** The history of what happened lives in `status_update`, not in old observations.
- **`Missing`** is a thread state that only the sync loop sets. It means T3 no longer knows the thread, for example because another machine owns it. A step whose newest thread is Missing reads as Needs you.
- **Cycles in `dependency` can't be blocked by a CHECK.** The command line tool rejects an edge that would close a cycle before it writes.

## Retries and crashes

Every write converges, whether it runs once or several times:

- `status_update.id` is generated by the caller. A retried `mr-handy status` sends the same id, and the insert does nothing on conflict.
- Link rows are keyed by what they link. The thread for `step_thread`, the URL for `step_pull_request`. Reposting the same update writes the same row.
- The sync loop overwrites observations wholesale. A crash halfway through leaves some rows older than others, and the next poll catches them up. Every page shows `observed_at`, so stale data is visible, not hidden.

## How step state is computed

The rules are the ones in `CONTEXT.md`, applied in this order, with the first match winning:

1. `closed_as` is set. The state is Done or Dropped.
2. Every pull request observed as Merged, at least one of them. The state is Merged.
3. The newest step thread is observed Running. The state is Working.
4. Any pull request is Open or Draft. The state is In review.
5. A step thread exists and is Waiting, Idle, Failed or Missing. The state is Needs you.
6. Every step it depends on is Merged or Done. The state is Ready.
7. Otherwise the state is Blocked.

Early start and Drift are flags computed alongside the state, not stored either.
