import {
  ClosedAs,
  Dependency,
  EnvironmentId,
  findCycle,
  type NewStep,
  PlanChange,
  type PlanEdit,
  PlanStepId,
  ProjectSlug,
  ProjectState,
  StatusUpdate,
  ThreadId,
  ThreadRef,
  TicketKey
} from "@mister-handy/domain"
import { Data, DateTime, Effect, Match, Schema } from "effect"
import { SqlClient } from "effect/sql"

const decodeAll = <S extends Schema.Decoder<unknown>>(row: S) => Schema.decodeUnknownEffect(Schema.Array(row))

const now = Effect.map(DateTime.now, DateTime.formatIso)

export class UnknownProject extends Data.TaggedError("UnknownProject")<{ readonly project: ProjectSlug }> {
  override get message() {
    return `there is no project ${this.project}.`
  }
}

export class UnknownStep extends Data.TaggedError("UnknownStep")<{
  readonly project: ProjectSlug
  readonly step: PlanStepId
  readonly known: ReadonlyArray<PlanStepId>
}> {
  override get message() {
    const known = this.known.length === 0 ? "It has no steps yet." : `Its steps are ${this.known.join(", ")}.`

    return `project ${this.project} has no step ${this.step}. ${known}`
  }
}

export class ProjectExists extends Data.TaggedError("ProjectExists")<{
  readonly project: ProjectSlug
  readonly existing: {
    readonly name: string
    readonly epic: TicketKey | null
    readonly coordinator: ThreadRef | null
  }
}> {
  override get message() {
    const { name, epic, coordinator } = this.existing

    const by =
      coordinator === null ? "no coordinator" : `coordinator ${coordinator.environmentId}/${coordinator.threadId}`

    return `project ${this.project} already exists as "${name}", epic ${epic ?? "none"}, ${by}.`
  }
}

export class StepExists extends Data.TaggedError("StepExists")<{
  readonly project: ProjectSlug
  readonly step: PlanStepId
  readonly title: string
  readonly ticket: TicketKey | null
}> {
  override get message() {
    return `project ${this.project} already has step ${this.step} titled "${this.title}" with ticket ${
      this.ticket ?? "none"
    }. Use step rewrite to change it.`
  }
}

export class TicketTaken extends Data.TaggedError("TicketTaken")<{
  readonly ticket: TicketKey
  readonly project: ProjectSlug
  readonly step: PlanStepId
}> {
  override get message() {
    return `ticket ${this.ticket} already belongs to step ${this.step} of project ${this.project}.`
  }
}

export class DependencyCycle extends Data.TaggedError("DependencyCycle")<{
  readonly path: ReadonlyArray<PlanStepId>
}> {
  override get message() {
    return `${this.path[0]} depending on ${this.path.at(-2)} would close a cycle: ${this.path.join(" -> ")}.`
  }
}

export class LinkedElsewhere extends Data.TaggedError("LinkedElsewhere")<{
  readonly link: ThreadRef | URL
  readonly project: ProjectSlug
  readonly step: PlanStepId
}> {
  override get message() {
    const link = this.link instanceof URL ? this.link.href : `${this.link.environmentId}/${this.link.threadId}`

    return `${link} already belongs to step ${this.step} of project ${this.project}.`
  }
}

export class DependsOnDropped extends Data.TaggedError("DependsOnDropped")<{
  readonly project: ProjectSlug
  readonly step: PlanStepId
  readonly on: PlanStepId
}> {
  override get message() {
    return `step ${this.on} of project ${this.project} was dropped, so ${this.step} can't depend on it. Depend on the steps ${this.on} waited on instead.`
  }
}

const refusals = [
  UnknownProject,
  UnknownStep,
  ProjectExists,
  StepExists,
  TicketTaken,
  DependencyCycle,
  LinkedElsewhere,
  DependsOnDropped
] as const

export type Refusal = InstanceType<(typeof refusals)[number]>

export const isRefusal = (u: unknown): u is Refusal => refusals.some((refusal) => u instanceof refusal)

const StepRow = Schema.Struct({
  id: PlanStepId,
  title: Schema.String,
  ticket: Schema.NullOr(TicketKey),
  position: Schema.Int,
  closedAs: Schema.NullOr(ClosedAs)
})

type StepRow = typeof StepRow.Type

const StepRef = Schema.Struct({ project: ProjectSlug, step: PlanStepId })

const loadPlan = Effect.fnUntraced(function* (project: ProjectSlug) {
  const sql = yield* SqlClient.SqlClient
  const found = yield* sql`SELECT 1 FROM project WHERE slug = ${project}`

  if (found.length === 0) return yield* new UnknownProject({ project })

  const steps = yield* decodeAll(StepRow)(
    yield* sql`
      SELECT step_id AS id, title, ticket_key AS ticket, position, closed_as AS "closedAs"
      FROM plan_step WHERE project_slug = ${project} ORDER BY position`
  )

  const edges = yield* decodeAll(Dependency)(
    yield* sql`SELECT before_step AS before, after_step AS after FROM dependency WHERE project_slug = ${project}`
  )

  const find = (step: PlanStepId) => steps.find((row) => row.id === step)

  const require = (step: PlanStepId) => {
    const row = find(step)

    return row === undefined
      ? Effect.fail(new UnknownStep({ project, step, known: steps.map((s) => s.id) }))
      : Effect.succeed(row)
  }

  /** The step `waiter` is about to wait on. A Dropped step never finishes, so nothing new may wait on it. */
  const requireDependency = Effect.fnUntraced(function* (waiter: PlanStepId, on: PlanStepId) {
    const row = yield* require(on)

    if (row.closedAs === "Dropped") return yield* new DependsOnDropped({ project, step: waiter, on })

    return row
  })

  return { project, edges, find, require, requireDependency }
})

const requireTicketFree = Effect.fnUntraced(function* (ticket: TicketKey) {
  const sql = yield* SqlClient.SqlClient

  const [holder] = yield* decodeAll(StepRef)(
    yield* sql`SELECT project_slug AS project, step_id AS step FROM plan_step WHERE ticket_key = ${ticket}`
  )

  if (holder !== undefined) return yield* new TicketTaken({ ticket, ...holder })
})

const appendPosition = Effect.fnUntraced(function* (project: ProjectSlug) {
  const sql = yield* SqlClient.SqlClient

  const [row] = yield* decodeAll(Schema.Struct({ position: Schema.Int }))(
    yield* sql`SELECT COALESCE(MAX(position), 0) + 1 AS position FROM plan_step WHERE project_slug = ${project}`
  )

  return row?.position ?? 1
})

const insertAfter = Effect.fnUntraced(function* (project: ProjectSlug, position: number) {
  const sql = yield* SqlClient.SqlClient
  yield* sql`UPDATE plan_step SET position = position + 1 WHERE project_slug = ${project} AND position > ${position}`

  return position + 1
})

const insertStep = Effect.fnUntraced(function* (
  project: ProjectSlug,
  step: NewStep,
  ticket: TicketKey | null,
  position: number
) {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT INTO plan_step (project_slug, step_id, title, ticket_key, position)
    VALUES (${project}, ${step.id}, ${step.title}, ${ticket}, ${position})`

  return PlanChange.StepAdded({ step: step.id, position })
})

const addEdges = Effect.fnUntraced(function* (
  project: ProjectSlug,
  existing: ReadonlyArray<Dependency>,
  wanted: ReadonlyArray<Dependency>
) {
  const sql = yield* SqlClient.SqlClient
  const edges = [...existing]
  const changes: Array<PlanChange> = []

  for (const edge of wanted) {
    if (edges.some((e) => e.before === edge.before && e.after === edge.after)) continue
    const path = findCycle(edges, edge)

    if (path !== null) return yield* new DependencyCycle({ path })
    yield* sql`INSERT INTO dependency VALUES (${project}, ${edge.before}, ${edge.after})`
    edges.push(edge)
    changes.push(PlanChange.DependencyAdded({ dependency: edge }))
  }

  return changes
})

type Case<Tag extends PlanEdit["_tag"]> = Extract<PlanEdit, { readonly _tag: Tag }>

const sameStep = (row: StepRow, title: string, ticket: TicketKey | null) => row.title === title && row.ticket === ticket

const AddStep = Effect.fnUntraced(function* (edit: Case<"AddStep">) {
  const plan = yield* loadPlan(edit.project)
  const after = edit.after === null ? null : yield* plan.require(edit.after)

  for (const dependency of edit.dependsOn) yield* plan.requireDependency(edit.step, dependency)
  const changes: Array<PlanChange> = []
  const existing = plan.find(edit.step)

  if (existing !== undefined) {
    if (!sameStep(existing, edit.title, edit.ticket)) {
      return yield* new StepExists({ project: edit.project, step: edit.step, ...existing })
    }
  } else {
    if (edit.ticket !== null) yield* requireTicketFree(edit.ticket)

    const position =
      after === null ? yield* appendPosition(edit.project) : yield* insertAfter(edit.project, after.position)

    changes.push(yield* insertStep(edit.project, { id: edit.step, title: edit.title }, edit.ticket, position))
  }

  const wanted = edit.dependsOn.map((before) => ({ before, after: edit.step }))
  changes.push(...(yield* addEdges(edit.project, plan.edges, wanted)))

  return changes
})

const RewriteStep = Effect.fnUntraced(function* (edit: Case<"RewriteStep">) {
  const sql = yield* SqlClient.SqlClient
  const plan = yield* loadPlan(edit.project)
  const row = yield* plan.require(edit.step)
  const title = edit.title ?? row.title
  const ticket = edit.ticket ?? row.ticket

  if (sameStep(row, title, ticket)) return []

  if (ticket !== null && ticket !== row.ticket) yield* requireTicketFree(ticket)
  yield* sql`
    UPDATE plan_step SET title = ${title}, ticket_key = ${ticket}
    WHERE project_slug = ${edit.project} AND step_id = ${edit.step}`

  return [PlanChange.StepRewritten({ step: edit.step })]
})

const SplitStep = Effect.fnUntraced(function* (edit: Case<"SplitStep">) {
  const plan = yield* loadPlan(edit.project)
  const original = yield* plan.require(edit.step)
  const changes: Array<PlanChange> = []
  let anchor = original.position

  for (const part of edit.parts) {
    const existing = plan.find(part.id)

    if (existing !== undefined) {
      if (existing.title !== part.title) {
        return yield* new StepExists({ project: edit.project, step: part.id, ...existing })
      }

      anchor = existing.position
      continue
    }

    anchor = yield* insertAfter(edit.project, anchor)
    changes.push(yield* insertStep(edit.project, part, null, anchor))
  }

  const isPart = (step: PlanStepId) => edit.parts.some((part) => part.id === step)
  const edgesOutsideSplit = plan.edges.filter((e) => !isPart(e.before) && !isPart(e.after))
  const waitsOn = edgesOutsideSplit.filter((e) => e.after === original.id).map((e) => e.before)
  const waiters = edgesOutsideSplit.filter((e) => e.before === original.id).map((e) => e.after)

  const wanted = edit.parts.flatMap((part) => [
    ...waitsOn.map((before) => ({ before, after: part.id })),
    ...waiters.map((after) => ({ before: part.id, after }))
  ])

  changes.push(...(yield* addEdges(edit.project, plan.edges, wanted)))

  return changes
})

const DropStep = Effect.fnUntraced(function* (edit: Case<"DropStep">) {
  const plan = yield* loadPlan(edit.project)
  yield* plan.require(edit.step)

  return yield* closeStep({ project: edit.project, stepId: edit.step, closedAs: "Dropped" })
})

const HoldStep = Effect.fnUntraced(function* (edit: Case<"HoldStep">) {
  const sql = yield* SqlClient.SqlClient
  const plan = yield* loadPlan(edit.project)
  yield* plan.require(edit.step)

  const held = yield* sql`
    UPDATE plan_step SET held_for = ${edit.reason}
    WHERE project_slug = ${edit.project} AND step_id = ${edit.step} AND held_for IS NOT ${edit.reason}
    RETURNING 1`

  return held.length === 0 ? [] : [PlanChange.StepHeld({ step: edit.step, reason: edit.reason })]
})

const ReleaseStep = Effect.fnUntraced(function* (edit: Case<"ReleaseStep">) {
  const sql = yield* SqlClient.SqlClient
  const plan = yield* loadPlan(edit.project)
  yield* plan.require(edit.step)

  const released = yield* sql`
    UPDATE plan_step SET held_for = NULL
    WHERE project_slug = ${edit.project} AND step_id = ${edit.step} AND held_for IS NOT NULL
    RETURNING 1`

  return released.length === 0 ? [] : [PlanChange.StepReleased({ step: edit.step })]
})

const AddDependency = Effect.fnUntraced(function* (edit: Case<"AddDependency">) {
  const plan = yield* loadPlan(edit.project)
  yield* plan.require(edit.step)
  yield* plan.requireDependency(edit.step, edit.on)

  return yield* addEdges(edit.project, plan.edges, [{ before: edit.on, after: edit.step }])
})

const RemoveDependency = Effect.fnUntraced(function* (edit: Case<"RemoveDependency">) {
  const sql = yield* SqlClient.SqlClient
  const plan = yield* loadPlan(edit.project)
  yield* plan.require(edit.step)
  yield* plan.require(edit.on)

  const removed = yield* sql`
    DELETE FROM dependency
    WHERE project_slug = ${edit.project} AND before_step = ${edit.on} AND after_step = ${edit.step}
    RETURNING 1`

  return removed.length === 0
    ? []
    : [PlanChange.DependencyRemoved({ dependency: { before: edit.on, after: edit.step } })]
})

/**
 * Applies one plan edit in one transaction. Rerunning an applied edit returns []. A refusal writes nothing.
 */
export const editPlan = Effect.fn("editPlan")(function* (edit: PlanEdit) {
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(
    Match.valueTags(edit, {
      AddStep,
      RewriteStep,
      SplitStep,
      DropStep,
      HoldStep,
      ReleaseStep,
      AddDependency,
      RemoveDependency
    })
  )
})

export const CloseStep = Schema.Struct({
  project: ProjectSlug,
  stepId: PlanStepId,
  closedAs: ClosedAs
})

export type CloseStep = typeof CloseStep.Type

/**
 * Marks a step Done or Dropped. A step already closed keeps its first mark, so a retry changes nothing.
 * Dropping a step hands its waiters its own dependencies.
 */
export const closeStep = Effect.fn("closeStep")(function* ({ project, stepId, closedAs }: CloseStep) {
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const closedAt = yield* now

      const [closed] = yield* decodeAll(Schema.Struct({ ticket: Schema.NullOr(TicketKey) }))(
        yield* sql`
        UPDATE plan_step SET closed_as = ${closedAs}, closed_at = ${closedAt}
        WHERE project_slug = ${project} AND step_id = ${stepId} AND closed_as IS NULL
        RETURNING ticket_key AS ticket`
      )

      if (closed === undefined) return []
      const changes: Array<PlanChange> = [PlanChange.StepClosed({ step: stepId, closedAs, ticket: closed.ticket })]

      if (closedAs === "Dropped") {
        const removed = yield* decodeAll(Dependency)(
          yield* sql`
          DELETE FROM dependency
          WHERE project_slug = ${project} AND (before_step = ${stepId} OR after_step = ${stepId})
          RETURNING before_step AS before, after_step AS after`
        )

        changes.push(...removed.map((dependency) => PlanChange.DependencyRemoved({ dependency })))

        for (const { before } of removed.filter((e) => e.after === stepId)) {
          for (const { after } of removed.filter((e) => e.before === stepId)) {
            const added = yield* sql`
            INSERT OR IGNORE INTO dependency VALUES (${project}, ${before}, ${after}) RETURNING 1`

            if (added.length > 0) changes.push(PlanChange.DependencyAdded({ dependency: { before, after } }))
          }
        }
      }

      return changes
    })
  )
})

export const NewProject = Schema.Struct({
  slug: ProjectSlug,
  name: Schema.NonEmptyString,
  epic: Schema.NullOr(TicketKey),
  coordinator: ThreadRef
})

export type NewProject = typeof NewProject.Type

const ProjectRow = Schema.Struct({
  name: Schema.String,
  epic: Schema.NullOr(TicketKey),
  environmentId: Schema.NullOr(EnvironmentId),
  threadId: Schema.NullOr(ThreadId)
})

/**
 * Creates a project in Planning with its coordinator. Returns false when the same project already exists.
 */
export const createProject = Effect.fn("createProject")(function* (input: NewProject) {
  const sql = yield* SqlClient.SqlClient
  const { environmentId, threadId } = input.coordinator

  const inserted = yield* sql`
    INSERT INTO project (slug, name, state, epic_key, coordinator_env_id, coordinator_thread_id, created_at)
    VALUES (${input.slug}, ${input.name}, 'Planning', ${input.epic}, ${environmentId}, ${threadId}, ${yield* now})
    ON CONFLICT (slug) DO NOTHING
    RETURNING 1`

  if (inserted.length > 0) return true

  const [row] = yield* decodeAll(ProjectRow)(
    yield* sql`
      SELECT name, epic_key AS epic, coordinator_env_id AS "environmentId", coordinator_thread_id AS "threadId"
      FROM project WHERE slug = ${input.slug}`
  )

  if (
    row !== undefined &&
    row.name === input.name &&
    row.epic === input.epic &&
    row.environmentId === environmentId &&
    row.threadId === threadId
  )
    return false

  return yield* new ProjectExists({
    project: input.slug,
    existing: {
      name: row?.name ?? "",
      epic: row?.epic ?? null,
      coordinator:
        row?.environmentId && row.threadId ? { environmentId: row.environmentId, threadId: row.threadId } : null
    }
  })
})

export const SetProjectState = Schema.Struct({ project: ProjectSlug, state: ProjectState })

export type SetProjectState = typeof SetProjectState.Type

/**
 * Sets the project state the user chose. Returns false when the project is already in that state.
 */
export const setProjectState = Effect.fn("setProjectState")(function* ({ project, state }: SetProjectState) {
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const found = yield* sql`SELECT 1 FROM project WHERE slug = ${project}`

      if (found.length === 0) return yield* new UnknownProject({ project })

      const changed = yield* sql`
        UPDATE project SET state = ${state} WHERE slug = ${project} AND state <> ${state} RETURNING 1`

      return changed.length > 0
    })
  )
})

/**
 * Records a status update and the link it carries, in one transaction. A retry inserts nothing and
 * returns false. `poster` is the thread that ran the command, stored on status_update only.
 */
export const recordStatusUpdate = Effect.fn("recordStatusUpdate")(function* (
  update: StatusUpdate,
  poster: ThreadRef | null
) {
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const plan = yield* loadPlan(update.project)
      yield* plan.require(update.stepId)
      const receivedAt = yield* now

      const link = Match.valueTags(update, {
        StepStarted: ({ thread, thread: { environmentId, threadId }, title }) => ({
          ref: thread,
          id: `${environmentId}/${threadId}`,
          // A repost can name a thread that was linked without one; it never clears a name.
          insert: sql`
          INSERT INTO step_thread (project_slug, step_id, env_id, thread_id, started_at, title)
          VALUES (${update.project}, ${update.stepId}, ${environmentId}, ${threadId}, ${receivedAt}, ${title ?? null})
          ON CONFLICT (env_id, thread_id) DO UPDATE SET title = COALESCE(excluded.title, step_thread.title)
          WHERE step_thread.project_slug = excluded.project_slug AND step_thread.step_id = excluded.step_id`,
          owner: sql`
          SELECT project_slug AS project, step_id AS step FROM step_thread
          WHERE env_id = ${environmentId} AND thread_id = ${threadId}`
        }),
        PullRequestOpened: ({ url }) => ({
          ref: url,
          id: url.href,
          insert: sql`
          INSERT INTO step_pull_request (project_slug, step_id, url, opened_at)
          VALUES (${update.project}, ${update.stepId}, ${url.href}, ${receivedAt})
          ON CONFLICT (url) DO NOTHING`,
          owner: sql`SELECT project_slug AS project, step_id AS step FROM step_pull_request WHERE url = ${url.href}`
        })
      })

      yield* link.insert
      const [owner] = yield* decodeAll(StepRef)(yield* link.owner)

      if (owner !== undefined && (owner.project !== update.project || owner.step !== update.stepId)) {
        return yield* new LinkedElsewhere({ link: link.ref, ...owner })
      }

      const body = JSON.stringify(yield* Schema.encodeEffect(StatusUpdate)(update))

      const inserted = yield* sql`
      INSERT INTO status_update (id, project_slug, step_id, kind, body, env_id, thread_id, received_at)
      VALUES (${`${update._tag}:${update.project}:${update.stepId}:${link.id}`}, ${update.project}, ${update.stepId},
              ${update._tag}, ${body}, ${poster?.environmentId ?? null}, ${poster?.threadId ?? null}, ${receivedAt})
      ON CONFLICT (id) DO NOTHING
      RETURNING 1`

      return inserted.length > 0
    })
  )
})
