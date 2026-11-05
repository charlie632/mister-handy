CREATE TABLE IF NOT EXISTS project (
  slug                   TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  state                  TEXT NOT NULL CHECK (state IN ('Planning','Active','Paused','Done')),
  epic_key               TEXT,
  coordinator_env_id     TEXT,
  coordinator_thread_id  TEXT,
  created_at             TEXT NOT NULL,
  CHECK ((coordinator_env_id IS NULL) = (coordinator_thread_id IS NULL))
);

CREATE TABLE IF NOT EXISTS project_reference (
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  label         TEXT NOT NULL,
  url           TEXT NOT NULL,
  PRIMARY KEY (project_slug, url)
);

CREATE TABLE IF NOT EXISTS plan_step (
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  step_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  ticket_key    TEXT UNIQUE,
  position      INTEGER NOT NULL,
  closed_as     TEXT CHECK (closed_as IN ('Done','Dropped')),
  closed_at     TEXT,
  held_for      TEXT,
  PRIMARY KEY (project_slug, step_id),
  CHECK ((closed_as IS NULL) = (closed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS dependency (
  project_slug  TEXT NOT NULL,
  before_step   TEXT NOT NULL,
  after_step    TEXT NOT NULL,
  PRIMARY KEY (project_slug, before_step, after_step),
  FOREIGN KEY (project_slug, before_step) REFERENCES plan_step(project_slug, step_id),
  FOREIGN KEY (project_slug, after_step)  REFERENCES plan_step(project_slug, step_id),
  CHECK (before_step <> after_step)
);

CREATE TABLE IF NOT EXISTS step_thread (
  project_slug    TEXT NOT NULL,
  step_id         TEXT NOT NULL,
  env_id          TEXT NOT NULL,
  thread_id       TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  title           TEXT,
  PRIMARY KEY (env_id, thread_id),
  FOREIGN KEY (project_slug, step_id) REFERENCES plan_step(project_slug, step_id)
);

CREATE TABLE IF NOT EXISTS step_pull_request (
  project_slug  TEXT NOT NULL,
  step_id       TEXT NOT NULL,
  url           TEXT NOT NULL PRIMARY KEY,
  opened_at     TEXT NOT NULL,
  FOREIGN KEY (project_slug, step_id) REFERENCES plan_step(project_slug, step_id)
);

CREATE TABLE IF NOT EXISTS status_update (
  id            TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL REFERENCES project(slug),
  step_id       TEXT,
  kind          TEXT NOT NULL,
  body          TEXT NOT NULL,
  env_id        TEXT,
  thread_id     TEXT,
  received_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_observation (
  env_id        TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('Running','Waiting','Idle','Failed','Settled','Missing')),
  title         TEXT,
  observed_at   TEXT NOT NULL,
  PRIMARY KEY (env_id, thread_id)
);

CREATE TABLE IF NOT EXISTS pull_request_observation (
  url           TEXT PRIMARY KEY,
  state         TEXT NOT NULL CHECK (state IN ('Draft','Open','Merged','Closed')),
  checks        TEXT CHECK (checks IN ('Pending','Passing','Failing')),
  observed_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_observation (
  ticket_key    TEXT PRIMARY KEY,
  jira_status   TEXT NOT NULL,
  observed_at   TEXT NOT NULL
);
