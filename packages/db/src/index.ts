/// <reference types="vite/client" />
import { SqliteClient } from "@effect/sql-sqlite-node"
import {
  ClosedAs,
  deriveStepNodes,
  EnvironmentId,
  PlanStepId,
  type Project,
  ProjectReference,
  ProjectSlug,
  ProjectState,
  StepPullRequest,
  type StepNode,
  StepThread,
  ThreadId,
  TicketKey,
  TicketObservation
} from "@mister-handy/domain"
import { Config, Data, DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import schema from "./schema.sql?raw"

export const databasePath = Config.String("MR_HANDY_DB").pipe(
  Config.withDefault(join(homedir(), ".mr-handy", "mister-handy.db"))
)

export const layer = SqliteClient.layerConfig({ filename: databasePath })

export class ScriptError extends Data.TaggedError("ScriptError")<{ readonly message: string; readonly cause: unknown }> {}

const scriptError = (cause: unknown) =>
  new ScriptError({ message: cause instanceof Error ? cause.message : String(cause), cause })

/**
 * Runs a multi-statement SQL script in one transaction. SqlClient prepares one statement at a time,
 * so scripts go through node:sqlite's exec directly.
 */
export const runScript = (filename: string, script: string) =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => {
        mkdirSync(dirname(filename), { recursive: true })
        return new DatabaseSync(filename)
      },
      catch: scriptError
    }),
    (db) =>
      Effect.try({
        try: () => {
          // Both pragmas are no-ops inside a transaction, so they run before BEGIN.
          db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; BEGIN")
          try {
            db.exec(script)
            db.exec("COMMIT")
          } catch (error) {
            db.exec("ROLLBACK")
            throw error
          }
        },
        catch: scriptError
      }),
    (db) => Effect.sync(() => db.close())
  )

export const applySchema = (filename: string) => runScript(filename, schema)

export interface ProjectView {
  readonly project: Project
  readonly coordinatorTitle: string | null
  /** Latest observed_at across the project's threads, pull requests and tickets. */
  readonly observedAt: string | null
  readonly steps: ReadonlyArray<StepNode>
}

const ProjectRow = Schema.Struct({
  slug: ProjectSlug,
  name: Schema.NonEmptyString,
  state: ProjectState,
  epic: Schema.NullOr(TicketKey),
  environmentId: Schema.NullOr(EnvironmentId),
  threadId: Schema.NullOr(ThreadId),
  coordinatorTitle: Schema.NullOr(Schema.String)
})

const StepRow = Schema.Struct({
  id: PlanStepId,
  title: Schema.NonEmptyString,
  ticket: Schema.NullOr(TicketKey),
  closedAs: Schema.NullOr(ClosedAs)
})

const DependencyRow = Schema.Struct({ before: PlanStepId, after: PlanStepId })

const ObservedAtRow = Schema.Struct({ observedAt: Schema.NullOr(Schema.String) })

const decodeAll = <S extends Schema.Decoder<unknown>>(row: S) => Schema.decodeUnknownEffect(Schema.Array(row))

export const readProject = Effect.fn("readProject")(function*(slug: ProjectSlug) {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* decodeAll(ProjectRow)(
    yield* sql`
      SELECT p.slug, p.name, p.state, p.epic_key AS epic,
             p.coordinator_env_id AS "environmentId", p.coordinator_thread_id AS "threadId",
             o.title AS "coordinatorTitle"
      FROM project p
      LEFT JOIN thread_observation o
        ON o.env_id = p.coordinator_env_id AND o.thread_id = p.coordinator_thread_id
      WHERE p.slug = ${slug}`
  )
  if (row === undefined) return null

  const references = yield* decodeAll(ProjectReference)(
    yield* sql`SELECT label, url FROM project_reference WHERE project_slug = ${slug} ORDER BY rowid`
  )
  const stepRows = yield* decodeAll(StepRow)(
    yield* sql`
      SELECT step_id AS id, title, ticket_key AS ticket, closed_as AS "closedAs"
      FROM plan_step WHERE project_slug = ${slug} ORDER BY position`
  )
  const dependencies = yield* decodeAll(DependencyRow)(
    yield* sql`SELECT before_step AS before, after_step AS after FROM dependency WHERE project_slug = ${slug}`
  )
  const threads = yield* decodeAll(StepThread)(
    yield* sql`
      SELECT t.step_id AS "stepId", t.env_id AS "environmentId", t.thread_id AS "threadId",
             t.started_at AS "startedAt", o.state, o.title
      FROM step_thread t
      LEFT JOIN thread_observation o USING (env_id, thread_id)
      WHERE t.project_slug = ${slug}`
  )
  const pullRequests = yield* decodeAll(StepPullRequest)(
    yield* sql`
      SELECT pr.step_id AS "stepId", pr.url, o.state
      FROM step_pull_request pr
      LEFT JOIN pull_request_observation o USING (url)
      WHERE pr.project_slug = ${slug}
      ORDER BY pr.opened_at`
  )
  const tickets = yield* decodeAll(TicketObservation)(
    yield* sql`
      SELECT o.ticket_key AS ticket, o.jira_status AS "jiraStatus"
      FROM ticket_observation o
      JOIN plan_step s ON s.ticket_key = o.ticket_key
      WHERE s.project_slug = ${slug}`
  )
  const [observed] = yield* decodeAll(ObservedAtRow)(
    yield* sql`
      SELECT MAX(observed_at) AS "observedAt" FROM (
        SELECT o.observed_at FROM thread_observation o
          JOIN step_thread t USING (env_id, thread_id) WHERE t.project_slug = ${slug}
        UNION ALL
        SELECT o.observed_at FROM pull_request_observation o
          JOIN step_pull_request pr USING (url) WHERE pr.project_slug = ${slug}
        UNION ALL
        SELECT o.observed_at FROM ticket_observation o
          JOIN plan_step s ON s.ticket_key = o.ticket_key WHERE s.project_slug = ${slug}
      )`
  )

  const steps = stepRows.map(({ closedAs, ...step }) => ({
    ...step,
    dependsOn: dependencies.filter((d) => d.after === step.id).map((d) => d.before),
    ...(closedAs === null ? {} : { closedAs })
  }))
  const { environmentId, threadId, coordinatorTitle, ...project } = row
  return {
    project: {
      ...project,
      coordinator: environmentId === null || threadId === null ? null : { environmentId, threadId },
      references
    },
    coordinatorTitle,
    observedAt: observed?.observedAt ?? null,
    steps: deriveStepNodes({ steps, threads, pullRequests, tickets })
  } satisfies ProjectView
})

export const listProjects = Effect.fn("listProjects")(function*() {
  const sql = yield* SqlClient.SqlClient
  const slugs = yield* decodeAll(Schema.Struct({ slug: ProjectSlug }))(
    yield* sql`SELECT slug FROM project ORDER BY created_at`
  )
  const views = yield* Effect.forEach(slugs, ({ slug }) => readProject(slug))
  return views.filter((view) => view !== null)
})

export const CloseStep = Schema.Struct({
  project: ProjectSlug,
  stepId: PlanStepId,
  closedAs: ClosedAs
})
export type CloseStep = typeof CloseStep.Type

/** Marks a step Done or Dropped. A step already closed keeps its first mark, so a retry changes nothing. */
export const closeStep = Effect.fn("closeStep")(function*({ project, stepId, closedAs }: CloseStep) {
  const sql = yield* SqlClient.SqlClient
  const closedAt = DateTime.formatIso(yield* DateTime.now)
  yield* sql`
    UPDATE plan_step SET closed_as = ${closedAs}, closed_at = ${closedAt}
    WHERE project_slug = ${project} AND step_id = ${stepId} AND closed_as IS NULL`
})
